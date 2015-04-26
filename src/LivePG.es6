var EventEmitter = require('events').EventEmitter
var Future       = require('fibers/future')
var _            = require('lodash')
var murmurHash   = require('murmurhash-js').murmur3

var common       = require('./common')
var SelectHandle = require('./SelectHandle')

/*
 * Duration (ms) to wait to check for new updates when no updates are
 *  available in current frame
 */
const STAGNANT_TIMEOUT = 100

class LivePG extends EventEmitter {
  constructor(connStr, channel) {
    super()
    this.connStr         = connStr
    this.channel         = channel
    this.notifyHandle    = null
    this.waitingToUpdate = []
    this.selectBuffer    = {}
    this.allTablesUsed   = {}
    this.tablesUsedCache = {}
    this.waitingPayloads = {}

    // Returns a Future
    // https://github.com/laverdet/node-fibers#futures
    this.ready = this._init()
      .resolve(this._error.bind(this))
  }

  select(query, params, triggers) {
    // Allow omission of params argument
    if(typeof params === 'object' && !(params instanceof Array)) {
      triggers = params
      params = []
    }
    else if(typeof params === 'undefined') {
      params = []
    }

    if(typeof query !== 'string')
      throw new Error('QUERY_STRING_MISSING')
    if(!(params instanceof Array))
      throw new Error('PARAMS_ARRAY_MISMATCH')

    let queryHash = murmurHash(JSON.stringify([ query, params ]))
    let handle = new SelectHandle(this, queryHash)

    // Perform initialization asynchronously
    this._initSelect(query, params, triggers, queryHash, handle)
      .resolve(this._error.bind(this))

    return handle
  }

  _processNotification(payload) {
    let argSep = []

    // Notification is 4 parts split by colons
    while(argSep.length < 3) {
      let lastPos = argSep.length !== 0 ? argSep[argSep.length - 1] + 1 : 0
      argSep.push(payload.indexOf(':', lastPos))
    }

    let msgHash   = payload.slice(0, argSep[0])
    let pageCount = payload.slice(argSep[0] + 1, argSep[1])
    let curPage   = payload.slice(argSep[1] + 1, argSep[2])
    let msgPart   = payload.slice(argSep[2] + 1, argSep[3])
    let fullMsg

    if(pageCount > 1) {
      // Piece together multi-part messages
      if(!(msgHash in this.waitingPayloads)) {
        this.waitingPayloads[msgHash] = _.range(pageCount).map(i => null)
      }
      this.waitingPayloads[msgHash][curPage - 1] = msgPart

      if(this.waitingPayloads[msgHash].indexOf(null) !== -1) {
        return null // Must wait for full message
      }

      fullMsg = this.waitingPayloads[msgHash].join('')

      delete this.waitingPayloads[msgHash]
    }
    else {
      // Payload small enough to fit in single message
      fullMsg = msgPart
    }

    return fullMsg
  }

  _error(reason) {
    reason && this.emit('error', reason)
  }

  _resolveAll(futures, callback) {
    var output = futures.map((fut, index) => fut.resolve((err, val) => {
      err && this._error(err)
      output[index] = val

      // Check of all values have returned
      if(output.filter(item => item instanceof Future).length === 0) {
        callback(output)
      }
    }))
  }
}

// The following functions each return a Future
// To use outside of a Fiber, use the .resolve(callback) method
LivePG.prototype._init = function() {
  this.notifyHandle = common.getClient(this.connStr)

  common.performQuery(this.notifyHandle.client, `LISTEN "${this.channel}"`)

  this.notifyHandle.client.on('notification', info => {
    if(info.channel === this.channel) {
      var payload = this._processNotification(info.payload)
      if(payload === null) {
        return // Full message has not arrived yet
      }

      try {
        // See common.createTableTrigger() for payload definition
        var payload = JSON.parse(payload)
      } catch(error) {
        return this._error(
          new Error('INVALID_NOTIFICATION ' + payload))
      }

      if(payload.table in this.allTablesUsed) {
        for(let queryHash of this.allTablesUsed[payload.table]) {
          let queryBuffer = this.selectBuffer[queryHash]
          if((queryBuffer.triggers
              // Check for true response from manual trigger
              && payload.table in queryBuffer.triggers
              && (payload.op === 'UPDATE'
                // Rows changed in an UPDATE operation must check old and new
                ? queryBuffer.triggers[payload.table](payload.new_data[0])
                  || queryBuffer.triggers[payload.table](payload.old_data[0])
                // Rows changed in INSERT/DELETE operations only check once
                : queryBuffer.triggers[payload.table](payload.data[0])))
            || (queryBuffer.triggers
              // No manual trigger for this table, always refresh
              && !(payload.table in  queryBuffer.triggers))
            // No manual triggers at all, always refresh
            || !queryBuffer.triggers) {

            this.waitingToUpdate.push(queryHash)
          }
        }
      }
    }
  })

  // Initialize neverending loop to refresh active result sets
  var performNextUpdate = function() {
    if(this.waitingToUpdate.length !== 0) {
      let queriesToUpdate =
        _.uniq(this.waitingToUpdate.splice(0, this.waitingToUpdate.length))

      this._resolveAll(
        queriesToUpdate.map(queryHash => this._updateQuery(queryHash)),
        performNextUpdate)
    }
    else {
      // No queries to update, wait for set duration
      setTimeout(performNextUpdate, STAGNANT_TIMEOUT)
    }
  }.bind(this)
  performNextUpdate()
}.future()

LivePG.prototype.cleanup = function() {
  this.notifyHandle.done()

  let pgHandle = common.getClient(this.connStr)

  for(let table of Object.keys(this.allTablesUsed)) {
    common.dropTableTrigger(pgHandle.client, table, this.channel)
  }

  pgHandle.done()
}.future()

LivePG.prototype._initSelect =
function(query, params, triggers, queryHash, handle) {
  if(queryHash in this.selectBuffer) {
    let queryBuffer = this.selectBuffer[queryHash]

    queryBuffer.handlers.push(handle)

    // Give a chance for event listener to be added
    common.delay()

    // Initial results from cache
    handle.emit('update',
      { removed: null, moved: null, copied: null, added: queryBuffer.data },
      queryBuffer.data)
  }
  else {
    // Initialize result set cache
    let newBuffer = this.selectBuffer[queryHash] = {
      query,
      params,
      triggers,
      data          : [],
      handlers      : [ handle ],
      notifications : []
    }

    let pgHandle = common.getClient(this.connStr)
    let tablesUsed
    if(queryHash in this.tablesUsedCache) {
      tablesUsed = this.tablesUsedCache[queryHash]
    }
    else {
      tablesUsed = common.getQueryDetails(pgHandle.client, query)
      this.tablesUsedCache[queryHash] = tablesUsed
    }

    for(let table of tablesUsed) {
      if(!(table in this.allTablesUsed)) {
        this.allTablesUsed[table] = [ queryHash ]
        common.createTableTrigger(pgHandle.client, table, this.channel)
      }
      else if(this.allTablesUsed[table].indexOf(queryHash) === -1) {
        this.allTablesUsed[table].push(queryHash)
      }
    }

    pgHandle.done()

    // Retrieve initial results
    this.waitingToUpdate.push(queryHash)
  }
}.future()

LivePG.prototype._updateQuery = function(queryHash) {
  let pgHandle = common.getClient(this.connStr)

  let queryBuffer = this.selectBuffer[queryHash]
  let update = common.getResultSetDiff(
    pgHandle.client,
    queryBuffer.data,
    queryBuffer.query,
    queryBuffer.params
  )

  pgHandle.done()

  if(update !== null) {
    queryBuffer.data = update.data

    for(let updateHandler of queryBuffer.handlers) {
      updateHandler.emit('update',
        filterHashProperties(update.diff), filterHashProperties(update.data))
    }
  }
}.future()

module.exports = LivePG
// Expose SelectHandle class so it may be modified by application
module.exports.SelectHandle = SelectHandle

function filterHashProperties(diff) {
  if(diff instanceof Array) {
    return diff.map(event => {
      return _.omit(event, '_hash')
    })
  }
  // Otherwise, diff is object with arrays for keys
  _.forOwn(diff, (rows, key) => {
    diff[key] = filterHashProperties(rows)
  })
  return diff
}
