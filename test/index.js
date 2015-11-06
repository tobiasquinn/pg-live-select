/**
 * Test Intialization

  * Tests use Postgres style parameter argument placeholders. For MySQL mode,
    these placeholders are replaced in test/helpers/querySequence.es6

 */

// Global flags
global.printDebug = process.env.DEBUG === '1'
global.printStats = process.env.STATS === '1'

// ES6+ may be used in all files required by this one
require('babel/register')({ stage: 0 })

var _         = require('lodash')
var LivePg    = require('../')
var LiveMysql = require('../').LiveMysql

// Define global instance
switch(process.env.MODE) {
  case 'pg':
    if(!('CONN' in process.env))
      throw new Error(
        'CONN environment variable required! (database connection string)')
    if(!('CHANNEL' in process.env))
      throw new Error(
        'CHANNEL environment variable required! (notification identifier string)')

    global.liveDb   = new LivePg(process.env.CONN, process.env.CHANNEL)
    break;
  case 'my':
    global.liveDb = new LiveMysql({
      host: process.env.HOST,
      user: process.env.USER,
      password: process.env.PASSWORD,
      database: process.env.DATABASE,
      serverId: process.env.SERVER_ID,
      minInterval: 200
    });
    break;
  default:
    throw new Error('MODE environment variable required! "pg" or "my"');
}
liveDb.on('error', function(error) { console.log(error) })

// Load full test suite
module.exports = _.assign(
  require('./helpers/lifecycle')
  , require('./scoresLoad') // Optional CLASS_COUNT env variable, default 1
  , require('./variousQueries')
)
