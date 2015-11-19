/*
Sub-class of LiveSelectBase to be used for unit-testing

* No connection settings required in constructor first argument

* Queries should be JSON-strings describing an object similar to the following.
  * Table name as key, object describing mock row change as value
  * Object-typed values in the rowEvent object will be replaced with an
    integer corresponding to the number of times that a row event has
    occurred.

  {
    test1: {
      id: {},
      name: 'Somebody',
      score: {}
    }
  }

*/
var ROW_EVENT_INTERVAL = 100;
var QUERY_DURATION = 500;

var util = require('util');

var _ = require('lodash');

var LiveSelectBase = require('../../lib/LiveSelectBase');

function LiveTestDb(settings, options) {
  var self = this;
  LiveSelectBase.call(self, options);

  self.rowEventCount = 0;
  self.tableRows = {};

  // At each interval, output a row changed for each mock row event
  self.rowEventInterval = setInterval(function() {
    Object.keys(self.tableRows).forEach(function(tableUsed) {
      self.tableRows[tableUsed].forEach(function(defaultRow) {
        self.rowEventCount++;

        var testRow = {};
        Object.keys(defaultRow).forEach(function(key) {
          // Object-typed values get replaced with an integer to track
          testRow[key] = typeof defaultRow[key] === 'object' ?
            self.rowEventCount : defaultRow[key];
        });

        self._matchRowEvent(tableUsed, testRow);
      });

    });
  }, ROW_EVENT_INTERVAL);
}

util.inherits(LiveTestDb, LiveSelectBase);
module.exports = LiveTestDb;

LiveTestDb.prototype.cleanup = function(callback) {
  var self = this;
  clearInterval(self.rowEventInterval);
  callback && callback();
}

LiveTestDb.prototype._initSelect = function(queryHash, buffer, callback) {
  var self = this;
  try {
    var testQuery = JSON.parse(buffer.query);
  } catch(err) {
    return callback(new Error('QUERY_MUST_BE_VALID_JSON'));
  }

  Object.keys(testQuery).forEach(function(tableUsed) {
    if(!(tableUsed in self.allTablesUsed)) {
      self.allTablesUsed[tableUsed] = [ queryHash ];

      self.tableRows[tableUsed] = [ testQuery[tableUsed] ];
    } else if(self.allTablesUsed[tableUsed].indexOf(queryHash) === -1) {
      self.allTablesUsed[tableUsed].push(queryHash);

      self.tableRows[tableUsed].push(testQuery[tableUsed]);
    }
  });

}

LiveTestDb.prototype._updateQuery = function(queryBuffer, callback) {
  var self = this;

  setTimeout(function() {
    callback(null, [ { some: 'data', count: self.rowEventCount } ]);
  }, QUERY_DURATION);
}
