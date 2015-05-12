
var querySequence = require('../../lib/querySequence.js');

module.exports = function(queries) {
  return new Promise((resolve, reject) => {
    querySequence(process.env.CONN, queries, error => {
      if(error) reject(error);
      else resolve();
    })
  })
}
