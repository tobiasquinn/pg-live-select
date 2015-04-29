var _ = require('lodash')
var randomString = require('random-strings')

var common = require('../../../src/common')

module.exports = async function () {
  var conn = await common.getClient(options.conn)

  var generatedValues = [
    // First param: class_id chosen randomly from generated count
    Math.ceil(Math.random() * settings.init.classCount),
    // Second param: set of hashes to exclude from result set
    //  (none will match but it simulates the real load)
    _.range(100).map(index => randomString.alphaLower(32))
  ]

  var values = _.range(settings.paramCount).map(index => generatedValues[index])

  await common.performQuery(conn.client, {
    name: 'performQuery_' + randomString.alphaLower(20),
    text: settings.query,
    values
  })

  conn.done()
}
