// pg-live-select, MIT License
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var _ = require('lodash');

function SelectHandle(parent, queryHash) {
  EventEmitter.call(this)
  this.parent    = parent
  this.queryHash = queryHash
}

util.inherits(SelectHandle, EventEmitter);
module.exports = SelectHandle;

SelectHandle.prototype.stop = function() {
  var self = this;
  var queryBuffer = self.parent.selectBuffer[self.queryHash];

  if(queryBuffer) {
    _.pull(queryBuffer.handlers, self);

    if(queryBuffer.handlers.length === 0) {
      // No more query/params like this, remove from buffers
      delete self.parent.selectBuffer[self.queryHash];
      _.pull(self.parent.waitingToUpdate, self.queryHash);

      Object.keys(self.parent.allTablesUsed).forEach(function(table) {
        _.pull(self.parent.allTablesUsed[table], self.queryHash);
      });
    }
  }
}

