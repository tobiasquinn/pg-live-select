var Future       = require('fibers/future')
var common = require('../../src/common')

var querySequence = function(queries) {
  return new Promise((resolve, reject) => {
    qsFuture(queries).resolve((err, val) => {
      if(err) reject(err)
      else resolve(val)
    })
  })
}

// Test code uses promises but library now uses Futures, provide bridge
var qsFuture = function (queries) {
  var connection = common.getClient(process.env.CONN)
  var client = connection.client

  var results = []

  if(queries.length === 0) return results

  for(let query of queries){
//    console.log('runnin query', query)
    results.push(performQuery(client, query))
  }

  if(connection) {
    connection.done()
  }

  return results
}.future()

module.exports = querySequence

function performQuery(client, query) {
  var fut = new Future
  var queryComplete = (error, rows, fields) => {
    if(error) fut.throw(error)
    else fut.return(rows)
  }

  if(query instanceof Array) {
    client.query(query[0], query[1], queryComplete)
  }
  else {
    client.query(query, queryComplete)
  }
  
  return fut.wait()
}
