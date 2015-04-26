'use strict';

var _inherits = require('babel-runtime/helpers/inherits')['default'];

var _get = require('babel-runtime/helpers/get')['default'];

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _Object$keys = require('babel-runtime/core-js/object/keys')['default'];

var EventEmitter = require('events').EventEmitter;
var Future = require('fibers/future');
var _ = require('lodash');
var murmurHash = require('murmurhash-js').murmur3;

var common = require('./common');
var SelectHandle = require('./SelectHandle');

/*
 * Duration (ms) to wait to check for new updates when no updates are
 *  available in current frame
 */
var STAGNANT_TIMEOUT = 100;

var LivePG = (function (_EventEmitter) {
  function LivePG(connStr, channel) {
    _classCallCheck(this, LivePG);

    _get(Object.getPrototypeOf(LivePG.prototype), 'constructor', this).call(this);
    this.connStr = connStr;
    this.channel = channel;
    this.notifyHandle = null;
    this.waitingToUpdate = [];
    this.selectBuffer = {};
    this.allTablesUsed = {};
    this.tablesUsedCache = {};
    this.waitingPayloads = {};

    // Returns a Future
    // https://github.com/laverdet/node-fibers#futures
    this.ready = this._init().resolve(this._error.bind(this));
  }

  _inherits(LivePG, _EventEmitter);

  _createClass(LivePG, [{
    key: 'select',
    value: function select(query, params, triggers) {
      // Allow omission of params argument
      if (typeof params === 'object' && !(params instanceof Array)) {
        triggers = params;
        params = [];
      } else if (typeof params === 'undefined') {
        params = [];
      }

      if (typeof query !== 'string') throw new Error('QUERY_STRING_MISSING');
      if (!(params instanceof Array)) throw new Error('PARAMS_ARRAY_MISMATCH');

      var queryHash = murmurHash(JSON.stringify([query, params]));
      var handle = new SelectHandle(this, queryHash);

      // Perform initialization asynchronously
      this._initSelect(query, params, triggers, queryHash, handle).resolve(this._error.bind(this));

      return handle;
    }
  }, {
    key: '_processNotification',
    value: function _processNotification(payload) {
      var argSep = [];

      // Notification is 4 parts split by colons
      while (argSep.length < 3) {
        var lastPos = argSep.length !== 0 ? argSep[argSep.length - 1] + 1 : 0;
        argSep.push(payload.indexOf(':', lastPos));
      }

      var msgHash = payload.slice(0, argSep[0]);
      var pageCount = payload.slice(argSep[0] + 1, argSep[1]);
      var curPage = payload.slice(argSep[1] + 1, argSep[2]);
      var msgPart = payload.slice(argSep[2] + 1, argSep[3]);
      var fullMsg = undefined;

      if (pageCount > 1) {
        // Piece together multi-part messages
        if (!(msgHash in this.waitingPayloads)) {
          this.waitingPayloads[msgHash] = _.range(pageCount).map(function (i) {
            return null;
          });
        }
        this.waitingPayloads[msgHash][curPage - 1] = msgPart;

        if (this.waitingPayloads[msgHash].indexOf(null) !== -1) {
          return null // Must wait for full message
          ;
        }

        fullMsg = this.waitingPayloads[msgHash].join('');

        delete this.waitingPayloads[msgHash];
      } else {
        // Payload small enough to fit in single message
        fullMsg = msgPart;
      }

      return fullMsg;
    }
  }, {
    key: '_error',
    value: function _error(reason) {
      reason && this.emit('error', reason);
    }
  }, {
    key: '_resolveAll',
    value: function _resolveAll(futures, callback) {
      var _this = this;

      var output = futures.map(function (fut, index) {
        return fut.resolve(function (err, val) {
          err && _this._error(err);
          output[index] = val;

          // Check of all values have returned
          if (output.filter(function (item) {
            return item instanceof Future;
          }).length === 0) {
            callback(output);
          }
        });
      });
    }
  }]);

  return LivePG;
})(EventEmitter);

// The following functions each return a Future
// To use outside of a Fiber, use the .resolve(callback) method
LivePG.prototype._init = (function () {
  var _this2 = this;

  this.notifyHandle = common.getClient(this.connStr);

  common.performQuery(this.notifyHandle.client, 'LISTEN "' + this.channel + '"');

  this.notifyHandle.client.on('notification', function (info) {
    if (info.channel === _this2.channel) {
      var payload = _this2._processNotification(info.payload);
      if (payload === null) {
        return; // Full message has not arrived yet
      }

      try {
        // See common.createTableTrigger() for payload definition
        var payload = JSON.parse(payload);
      } catch (error) {
        return _this2._error(new Error('INVALID_NOTIFICATION ' + payload));
      }

      if (payload.table in _this2.allTablesUsed) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _getIterator(_this2.allTablesUsed[payload.table]), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var queryHash = _step.value;

            var queryBuffer = _this2.selectBuffer[queryHash];
            if (queryBuffer.triggers
            // Check for true response from manual trigger
             && payload.table in queryBuffer.triggers && (payload.op === 'UPDATE'
            // Rows changed in an UPDATE operation must check old and new
            ? queryBuffer.triggers[payload.table](payload.new_data[0]) || queryBuffer.triggers[payload.table](payload.old_data[0])
            // Rows changed in INSERT/DELETE operations only check once
            : queryBuffer.triggers[payload.table](payload.data[0])) || queryBuffer.triggers
            // No manual trigger for this table, always refresh
             && !(payload.table in queryBuffer.triggers)
            // No manual triggers at all, always refresh
             || !queryBuffer.triggers) {

              _this2.waitingToUpdate.push(queryHash);
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator['return']) {
              _iterator['return']();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      }
    }
  });

  // Initialize neverending loop to refresh active result sets
  var performNextUpdate = (function () {
    var _this3 = this;

    if (this.waitingToUpdate.length !== 0) {
      var queriesToUpdate = _.uniq(this.waitingToUpdate.splice(0, this.waitingToUpdate.length));

      this._resolveAll(queriesToUpdate.map(function (queryHash) {
        return _this3._updateQuery(queryHash);
      }), performNextUpdate);
    } else {
      // No queries to update, wait for set duration
      setTimeout(performNextUpdate, STAGNANT_TIMEOUT);
    }
  }).bind(this);
  performNextUpdate();
}).future();

LivePG.prototype.cleanup = (function () {
  this.notifyHandle.done();

  var pgHandle = common.getClient(this.connStr);

  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = _getIterator(_Object$keys(this.allTablesUsed)), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var table = _step2.value;

      common.dropTableTrigger(pgHandle.client, table, this.channel);
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2['return']) {
        _iterator2['return']();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }

  pgHandle.done();
}).future();

LivePG.prototype._initSelect = (function (query, params, triggers, queryHash, handle) {
  if (queryHash in this.selectBuffer) {
    var queryBuffer = this.selectBuffer[queryHash];

    queryBuffer.handlers.push(handle);

    // Give a chance for event listener to be added
    common.delay();

    // Initial results from cache
    handle.emit('update', { removed: null, moved: null, copied: null, added: queryBuffer.data }, queryBuffer.data);
  } else {
    // Initialize result set cache
    var newBuffer = this.selectBuffer[queryHash] = {
      query: query,
      params: params,
      triggers: triggers,
      data: [],
      handlers: [handle],
      notifications: []
    };

    var pgHandle = common.getClient(this.connStr);
    var tablesUsed = undefined;
    if (queryHash in this.tablesUsedCache) {
      tablesUsed = this.tablesUsedCache[queryHash];
    } else {
      tablesUsed = common.getQueryDetails(pgHandle.client, query);
      this.tablesUsedCache[queryHash] = tablesUsed;
    }

    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = _getIterator(tablesUsed), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var table = _step3.value;

        if (!(table in this.allTablesUsed)) {
          this.allTablesUsed[table] = [queryHash];
          common.createTableTrigger(pgHandle.client, table, this.channel);
        } else if (this.allTablesUsed[table].indexOf(queryHash) === -1) {
          this.allTablesUsed[table].push(queryHash);
        }
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3['return']) {
          _iterator3['return']();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }

    pgHandle.done();

    // Retrieve initial results
    this.waitingToUpdate.push(queryHash);
  }
}).future();

LivePG.prototype._updateQuery = (function (queryHash) {
  var pgHandle = common.getClient(this.connStr);

  var queryBuffer = this.selectBuffer[queryHash];
  var update = common.getResultSetDiff(pgHandle.client, queryBuffer.data, queryBuffer.query, queryBuffer.params);

  pgHandle.done();

  if (update !== null) {
    queryBuffer.data = update.data;

    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
      for (var _iterator4 = _getIterator(queryBuffer.handlers), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
        var updateHandler = _step4.value;

        updateHandler.emit('update', filterHashProperties(update.diff), filterHashProperties(update.data));
      }
    } catch (err) {
      _didIteratorError4 = true;
      _iteratorError4 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion4 && _iterator4['return']) {
          _iterator4['return']();
        }
      } finally {
        if (_didIteratorError4) {
          throw _iteratorError4;
        }
      }
    }
  }
}).future();

module.exports = LivePG;
// Expose SelectHandle class so it may be modified by application
module.exports.SelectHandle = SelectHandle;

function filterHashProperties(diff) {
  if (diff instanceof Array) {
    return diff.map(function (event) {
      return _.omit(event, '_hash');
    });
  }
  // Otherwise, diff is object with arrays for keys
  _.forOwn(diff, function (rows, key) {
    diff[key] = filterHashProperties(rows);
  });
  return diff;
}