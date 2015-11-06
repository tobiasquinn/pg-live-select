
var querySequencePg = require('../../lib/querySequence.js');

var querySequenceMy = function(connection, debug, queries, callback){
  if(debug instanceof Array){
    callback = queries;
    queries = debug;
    debug = false;
  }
  var results = [];
  var sequence = queries.map(function(queryStr, index, initQueries){
    return function(){
      debug && console.log('Query Sequence', index, queryStr);
      var queryCallback = function(err, rows, fields){
        if(err) return callback(err);
        results.push(rows);
        if(index < sequence.length - 1){
          sequence[index + 1]();
        }else{
          setTimeout(function(){
            callback(null, results);
          }, 200);
        }
      };

      if(typeof queryStr === 'string') {
        connection.query(queryStr, queryCallback);
      } else if (queryStr instanceof Array) {
        // queryStr is array with [ query, parameters ]

        // Replace Postgres style parameter argument placeholders with MySQL
        //  style (%1, %2 => ?, ?)
        var fixedQuery = queryStr[0].replace(/\$\d+/g, '?');

        connection.query(fixedQuery, queryStr[1], queryCallback);
      } else {
        throw new Error('Invalid query!');
      }
    }
  });
  sequence[0]();
};

module.exports = function(queries) {
  return new Promise((resolve, reject) => {
    var handlerFun, connection;

    switch(serverMode) {
      case 'pg':
        handlerFun = querySequencePg;
        connection = process.env.CONN;
      break;
      case 'my':
        handlerFun = querySequenceMy;
        connection = liveDb.db;
        break;
    }

    handlerFun(connection, queries, (error, results) => {
      if(error) reject(error);
      else resolve();
    })
  })
}
