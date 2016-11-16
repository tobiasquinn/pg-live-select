// pg-live-select, MIT License
var _ = require('lodash');

exports.generate = function(oldHashes, newData) {
  var curHashes = newData.map(function(row) { return row._hash; });
  var newHashes = curHashes.filter(
    function(hash) { return oldHashes.indexOf(hash) === -1 ;});

  // Need copy of curHashes so duplicates can be checked off
  var curHashes2 = curHashes.slice();
  var addedRows = newData
    .filter(function(row) { return row._added === 1; })
    .map(function(row) {
      // Prepare row meta-data
      row._index = curHashes2.indexOf(row._hash) + 1;
      delete row._added;

      // Clear this hash so that duplicate hashes can move forward
      curHashes2[row._index - 1] = undefined;

      return row;
    });

  var movedHashes = curHashes.map(function(hash, newIndex) {
    var oldIndex = oldHashes.indexOf(hash);

    if(oldIndex !== -1 &&
        oldIndex !== newIndex &&
        curHashes[oldIndex] !== hash) {
      return {
        old_index: oldIndex + 1,
        new_index: newIndex + 1,
        _hash: hash
      };
    }
  }).filter(function(moved) { return moved !== undefined; });

  var removedHashes = oldHashes
    .map(function(_hash, index) { return { _hash: _hash, _index: index + 1 }; })
    .filter(function(removed) {
      return curHashes[removed._index - 1] !== removed._hash
        && movedHashes.filter(
            function(moved) { return moved.new_index === removed._index; }
          ).length === 0
    });

  // Add rows that have already existing hash but in new places
  var copiedHashes = curHashes.map(function(hash, index) {
    var oldHashIndex = oldHashes.indexOf(hash);
    if(oldHashIndex !== -1 &&
        oldHashes[index] !== hash &&
        movedHashes.filter(function(moved) {
          return moved.new_index - 1 === index; }).length === 0 &&
        addedRows.filter(function(added) {
          added._index - 1 === index; }).length === 0){
      return {
        new_index: index + 1,
        orig_index: oldHashIndex + 1
      };
    }
  }).filter(function(copied) { return copied !== undefined; });

  var diff = {
    removed: removedHashes.length !== 0 ? removedHashes : null,
    moved: movedHashes.length !== 0 ? movedHashes: null,
    copied: copiedHashes.length !== 0 ? copiedHashes: null,
    added: addedRows.length !== 0 ? addedRows : null
  };

  if(diff.added === null &&
      diff.moved === null &&
      diff.copied === null &&
      diff.removed === null) return null;

  return diff;
}

exports.apply = function(data, diff) {
  var newResults = data.slice();
  var removedResults = data.slice();

  diff.removed !== null && diff.removed.forEach(
    function(removed) { newResults[removed._index - 1] = undefined; });

  // Deallocate first to ensure no overwrites
  diff.moved !== null && diff.moved.forEach(
    function(moved) { removedResults[moved.old_index - 1] = undefined;
                      newResults[moved.old_index - 1] = undefined; });

  diff.copied !== null && diff.copied.forEach(function(copied) {
    var copyRow = _.clone(data[copied.orig_index - 1]);
    copyRow._index = copied.new_index;
    newResults[copied.new_index - 1] = copyRow;
    removedResults[copied.new_index - 1] = undefined;
  });

  diff.moved !== null && diff.moved.forEach(function(moved) {
    var movingRow = data[moved.old_index - 1];
    movingRow._index = moved.new_index;
    newResults[moved.new_index - 1] = movingRow;
    removedResults[moved.new_index - 1] = undefined;
  });

  diff.added !== null && diff.added.forEach(
    function(added) { newResults[added._index - 1] = added; });

  return {newResults: newResults.filter(function(row) { return row !== undefined; }),
          removedResults: removedResults};
}
