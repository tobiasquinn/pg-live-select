var _ = require('lodash')
var randomString = require('random-strings')

var common = require('../../../src/common')

module.exports = async function () {
  var conn = await common.getClient(options.conn)

  settings.params[0] = Math.ceil(Math.random() * settings.init.classCount)
  var oldHashes = _.range(100).map(index => randomString.alphaLower(32))

  await common.performQuery(conn.client,
    settings.query.replace('OLDHASHES', oldHashes.join("','")), settings.params)

  conn.done()
}
