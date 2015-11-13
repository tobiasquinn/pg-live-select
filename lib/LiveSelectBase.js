// pg-live-select, MIT License
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var _ = require('lodash');
var murmurHash   = require('murmurhash-js').murmur3

var SelectHandle = require('./SelectHandle');

var differs = {
  'default': require('./diff.default').diff,
  'deep': require('./diff.deep').diff
};

/*
 * Duration (ms) to wait to check for new updates when no updates are
 *  available in current frame
 */
var STAGNANT_TIMEOUT = 100;

function LiveSelectBase(options) {
  var self = this;
  EventEmitter.call(self);

  self.options = options || {};
  self.options.diff = self.options.diff || 'default';

  self.waitingToUpdate = [];
  self.selectBuffer    = {};

  // In ._initSelect, include queryHash of new query for each table used by
  //  the query.
  // { [tableName]: [ queryHash, queryHash... ], ... }
  self.allTablesUsed   = {};

  self._initUpdateLoop();

}

util.inherits(LiveSelectBase, EventEmitter);
module.exports = LiveSelectBase;

LiveSelectBase.prototype.select = function(query, params, triggers) {
  var self = this;

  // Allow omission of params argument
  if(typeof params === 'object' && !(params instanceof Array)) {
    triggers = params;
    params = [];
  } else if(typeof params === 'undefined') {
    params = [];
  }

  if(typeof query !== 'string')
    throw new Error('QUERY_STRING_MISSING');
  if(!(params instanceof Array))
    throw new Error('PARAMS_ARRAY_MISMATCH');

  var queryHash = murmurHash(JSON.stringify([ query, params ]));
  var handle = new SelectHandle(self, queryHash);

  // Perform initialization asynchronously
  if(queryHash in self.selectBuffer) {
    // Same query already exists
    // Give a chance for event listener to be added
    process.nextTick(function() {
      var queryBuffer = self.selectBuffer[queryHash];

      queryBuffer.handlers.push(handle);

      // Initial results from cache
      handle.emit('update', null, queryBuffer.data);
    });
  } else {
    // Initialize result set cache
    var newBuffer = self.selectBuffer[queryHash] = {
      query         : query,
      params        : params,
      triggers      : triggers,
      data          : [],
      handlers      : [ handle ],
      initialized   : false,
      updating      : false
    }

    // Callback for _initSelect
    var readyToUpdate = function(error) {
      if(error) return handle.emit('error', error);
      // Retrieve initial results
      self.waitingToUpdate.push(queryHash)
    };

    self._initSelect && self._initSelect(queryHash, newBuffer, readyToUpdate);
  }

  return handle;
}

LiveSelectBase.prototype._initUpdateLoop = function() {
  var self = this;

  var performNextUpdate = function() {
    if(self.waitingToUpdate.length !== 0) {
      var queriesToUpdate =
        _.uniq(self.waitingToUpdate.splice(0, self.waitingToUpdate.length));
      var updateReturned = 0;

      queriesToUpdate.forEach(function(queryHash) {
        var queryBuffer = self.selectBuffer[queryHash];
        queryBuffer.updating = true;
        self._updateQuery(queryBuffer, function(error, newResults) {
          queryBuffer.updating = false;
          updateReturned++;
          if(error) return self.emit('error', error);

          if(!(self.options.diff in differs))
            return self.emit('error', new Error('INVALID_DIFF: ' + self.options.diff))

          var eventArgs;
          if(queryBuffer.initialized === false && newResults.length === 0){
            eventArgs = [ 'update', null, [] ];
          } else {
            var diff = differs[self.options.diff](queryBuffer.data, newResults);
            if(diff) {
              queryBuffer.data = newResults;
              var outputData = newResults.map(function(row, index) {
                // Do not pass reference to cached row
                row = _.clone(row);

                // Filter metadata
                delete row._hash;

                // Apply metadata
                row._index = index + 1;

                return row;
              });

              eventArgs = [ 'update', diff, outputData ];
            }
          }

          if(eventArgs) {
            queryBuffer.handlers.forEach(function(handle) {
              handle.emit.apply(handle, eventArgs);
            });

            queryBuffer.initialized = true
          }

          if(updateReturned === queriesToUpdate.length) performNextUpdate();
        })
      });
    } else {
      // No queries to update, wait for set duration
      setTimeout(performNextUpdate, STAGNANT_TIMEOUT);
    }
  };

  performNextUpdate();
}

/*
  Check a row change event against live select queries queued
  @param table  String Name of table this row belongs
  @param row    Object Map of columns for this row (INSERT, DELETE, UPDATE)
  @param newRow Object Map of columns for this row (UPDATE only)
  @return Boolean True if at least one query was set to update
*/
LiveSelectBase.prototype._matchRowEvent = function(table, row, newRow) {
  var self = this;
  var updateMatched = false;

  // TODO add support for skipping data invalidation functions on
  //       queryBuffer.updating = true
  if(table in self.allTablesUsed) {
    self.allTablesUsed[table].forEach(function(queryHash) {
      var queryBuffer = self.selectBuffer[queryHash];

      // TODO support single called invalidation functions (row, newRow, rowDeleted)
      if((queryBuffer.triggers
          // Check for true response from manual trigger
          && table in queryBuffer.triggers
          && (newRow
            // Rows changed in an UPDATE operation must check old and new
            ? queryBuffer.triggers[table](row)
              || queryBuffer.triggers[table](newRow)
            // Rows changed in INSERT/DELETE operations only check once
            : queryBuffer.triggers[table](row)))
        || (queryBuffer.triggers
          // No manual trigger for this table, always refresh
          && !(payload.table in queryBuffer.triggers))
        // No manual triggers at all, always refresh
        || !queryBuffer.triggers) {

        self.waitingToUpdate.push(queryHash);
        updateMatched = true;
      }
    });
  }

  return updateMatched;
}

// The following methods should be replaced by child class

/*
  @param callback Function Optional
  @return undefined
*/
LiveSelectBase.prototype.cleanup = function(callback) { callback && callback() };

/*
  * Needs to update LiveSelectBase.prototype.allTablesUsed map
  @param queryHash Integer
  @param buffer Object QueryBuffer
  @param callback Function
  @return undefined
*/
LiveSelectBase.prototype._initSelect = function(queryHash, buffer, callback) {}

/*
  * Perform an update on the query and emit an 'update' event from each handler
    in queryBuffer.handlers
  * When queryBuffer.initialized === false, initial 'update' event must be
    emitted, even for empty dataset.
  * Be sure to set queryBuffer.initialized = true after emitting 'update' event
  @param queryBuffer Object
  @param callback Function
  @return undefined
*/
LiveSelectBase.prototype._updateQuery = function(queryBuffer, callback) {}
