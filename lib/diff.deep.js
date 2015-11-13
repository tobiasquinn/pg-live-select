// pg-live-select, MIT License
var _ = require('lodash');
var deepDiff = require('deep-diff').diff;

exports.diff = function(oldRows, newRows) {
  oldRows = cloneAndClean(oldRows);
  newRows = cloneAndClean(newRows);

  return deepDiff(oldRows, newRows);
};

function cloneAndClean(rows) {
  // This diff algorithm does not utilize the _hash property
  return _.clone(rows, true).map(function(row) {
    delete row._hash;
    return row;
  });
}
