'use strict';

var _inherits = require('babel-runtime/helpers/inherits')['default'];

var _get = require('babel-runtime/helpers/get')['default'];

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _Object$keys = require('babel-runtime/core-js/object/keys')['default'];

var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');

var SelectHandle = (function (_EventEmitter) {
  function SelectHandle(parent, queryHash) {
    _classCallCheck(this, SelectHandle);

    _get(Object.getPrototypeOf(SelectHandle.prototype), 'constructor', this).call(this);
    this.parent = parent;
    this.queryHash = queryHash;
  }

  _inherits(SelectHandle, _EventEmitter);

  _createClass(SelectHandle, [{
    key: 'stop',
    value: function stop() {
      var parent = this.parent;
      var queryHash = this.queryHash;

      var queryBuffer = parent.selectBuffer[queryHash];

      if (queryBuffer) {
        _.pull(queryBuffer.handlers, this);

        if (queryBuffer.handlers.length === 0) {
          // No more query/params like this, remove from buffers
          delete parent.selectBuffer[queryHash];
          _.pull(parent.waitingToUpdate, queryHash);

          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = _getIterator(_Object$keys(parent.allTablesUsed)), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var table = _step.value;

              _.pull(parent.allTablesUsed[table], queryHash);
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
    }
  }]);

  return SelectHandle;
})(EventEmitter);

module.exports = SelectHandle;