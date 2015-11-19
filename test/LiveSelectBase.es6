var _ = require('lodash');

var querySequence = require('./helpers/querySequence');
var waitForCallbacks = require('./helpers/waitForCallbacks');
var LiveTestDb = require('./fixtures/LiveTestDb');

exports.simple = function(test) {
  var TEST_DURATION = 2000;

  var myVal = 0;
  var myDb = new LiveTestDb(null, {});
  var simpleSel = myDb.select(JSON.stringify({
    test_table: {
      value: {},
      name: 'simple'
    }
  }), [], {
    test_table: function(row) {
      // Row event should happen only one row event after last known value
      test.equal(row.value, myVal + 1);
      myVal = row.value;
      return true;
    }
  }).on('update', function(diff, data) {
    // More than one row event should have happened in the time to update the
    // query, assuming  QUERY_DURATION > ROW_EVENT_INTERVAL * 2
    test.ok(data[0].count - myVal > 1);
    myVal = data[0].count;
  });
  setTimeout(function() {
    simpleSel.stop();
    myDb.cleanup(test.done);
  }, TEST_DURATION);
}

exports.checkConditionWhenQueued = function(test) {
  var TEST_DURATION = 2000;

  function initQuery(cCWQ) {
    var db = new LiveTestDb(null, { checkConditionWhenQueued: cCWQ });
    var output = {
      cCWQ: cCWQ,
      rowEventCount: 0,
      updateCount: 0,
      select: db.select(JSON.stringify({
        test_table: {
          value: {},
        }
      }), [], {
        test_table: function(row) {
          output.rowEventCount++;
          return true;
        }
      }).on('update', function(diff, data) {
        output.updateCount++;
      })
    };
    return output;
  }
  var allCases = [ initQuery(false), initQuery(true) ];

  setTimeout(function() {
    // Test is done when each case completes
    var cleanupDone = waitForCallbacks(allCases.length, test.done, true);

    allCases.forEach(function(thisCase) {
      var thisDb = thisCase.select.parent;
      if(thisCase.cCWQ) {
        // With checkConditionWhenQueued, the number of times the invalidation
        // function was called should match the number of rows that the
        // live select received
        test.equal(thisCase.rowEventCount, thisDb.rowEventCount);
      } else {
        // If the query is updating or waiting to update, there will be an
        // extra row event recorded
        var extraRowEvent =
          thisDb.selectBuffer[thisCase.select.queryHash].updating ||
          thisDb.waitingToUpdate.indexOf(thisCase.select.queryHash) !== -1;

        // Without cCWQ, the invalidation function will be called only once for
        // each update
        test.equal(
          thisCase.rowEventCount - (extraRowEvent ? 1 : 0),
          thisCase.updateCount
        );
      }
      thisCase.select.stop();
      thisDb.cleanup(cleanupDone);
    });
  }, TEST_DURATION);

};
