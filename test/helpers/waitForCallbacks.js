/*
 * Similar to Promise.all() but for callbacks
 * @param finalCount    Integer  Number of callbacks to wait for
 * @param finalCallback Function Call when finalCount has been reached
 * @param noArguments   Boolean  Do not pass result argument array when true
*/
module.exports = function(finalCount, finalCallback, noArguments) {
  var results = [];
  var incrementor = function() {
    results.push(arguments);

    if(results.length === finalCount)
      finalCallback(noArguments ? undefined : results);
  };

  return incrementor;
}
