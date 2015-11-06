/**
 * Test Intialization

  * Tests use Postgres style parameter argument placeholders. For MySQL mode,
    these placeholders are replaced in test/helpers/querySequence.es6

 */

// Global flags
global.printDebug = process.env.DEBUG === '1'
global.printStats = process.env.STATS === '1'
global.serverMode = process.env.MODE

// ES6+ may be used in all files required by this one
require('babel/register')({ stage: 0 })

var _         = require('lodash')
var liveSql   = require('../')

var settings  = require('./settings');
if(!serverMode in settings)
  throw new Error('Invalid MODE setting! Available: ' +
    Object.keys(settings).join(', '));

// Define global instance
global.liveDb = liveSql.connect(settings[serverMode], {});
liveDb.on('error', function(error) { console.log(error) })

// Load full test suite
module.exports = _.assign(
  require('./helpers/lifecycle')
  , require('./scoresLoad') // Optional CLASS_COUNT env variable, default 1
  , require('./variousQueries')
)
