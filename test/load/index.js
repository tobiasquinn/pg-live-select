/**
 * Load Test #2
 */

// ES6+ may be used in all files required by this one
require('babel/register')({ stage: 0 })

var fs = require('fs')
var _ = require('lodash')
var parseArgs = require('minimist')

// Determine options from command line arguments
var args = parseArgs(process.argv.slice(2))

var defaults = {
  conn: 'postgres://meteor:meteor@127.0.0.1/meteor_test',
  channel: 'load_test',
  case: 'static',
  output: null,
  assign_count: null // override settings.init.assignPerClass
}

function loadDirCases(path) {
  return fs.readdirSync(path).filter(function(filename) {
    return filename.substr(-4) === '.es6'
  }).map(function(filename) {
    return filename.substr(0, filename.length - 4)
  })
}

var allCases = loadDirCases('test/load/cases')
var allMetaCases = loadDirCases('test/load/meta')

if(args.help === true){
  console.log('Load Test Runner\n')
  console.log('Default options:\n')
  console.log(defaults)
  console.log('\nUse \'--key="value"\' command line arguments to change defaults.')
  console.log('\nSet \'--case=all\' to run all cases except common.getClient')
  console.log('  There is an issue with common.getClient not closing properly.')
  console.log('  When running all cases, each will run for 30 mins duration.')
  console.log('\nSet \'--output="filename"\' to export the data in JSON format.')
  console.log('\nAvailable cases:\n----------------');
  allCases.forEach(function(name) { console.log(name) });
  allMetaCases.forEach(function(name) { console.log(name + '*') });
  console.log('\n * Meta cases run a set of cases for specific duration each');
  process.exit()
}

global.options = _.object(_.map(defaults, function(value, key) {
  return [ key, key in args ? args[key] : value ]
}))


if(allMetaCases.indexOf(options.case) !== -1) {
  require('./meta/' + options.case)
}
else if(allCases.indexOf(options.case) !== -1) {
  global.settings = require('./cases/' + options.case)

  // Setup in ES6 file
  if(options.case === 'interactive') {
    require('./setup-interactive')
  }
  else {
    require('./setup')
  }
}
else {
  console.log('Invalid case specified!')
}
