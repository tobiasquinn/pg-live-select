require('babel/register')({ stage: 0 })
var _ = require('lodash')
var Fiber = require('fibers')

global.options  = JSON.parse(process.argv[2])
global.settings = JSON.parse(process.argv[3])

var runner = require('./' + settings.customRunner)

// runner = function when using promise, runner.runner when using callback
if(typeof runner === 'function'
  || typeof runner.runner === 'function'
  || typeof runner.fiberRunner === 'function') {
  // Unit tests will export an async function that can be run over and over

  // Milliseconds to wait between finishing one operation and starting next
  var SLEEP_DURATION = 10

  var runAgain = function() {
    process.stdout.write(['NEXT_EVENT', Date.now()].join(' '))
    performOperationForever()
  }

  var runAfterTimeout = function() {
    setTimeout(runAgain, SLEEP_DURATION)
  }

  var runnerError = function(reason) {
    console.error('Operation Failed', reason.stack)
  }

  var performOperationForever = function() {
    if(typeof runner === 'function') {
      runner().then(runAfterTimeout, runnerError)
    }
    else if(typeof runner.runner === 'function') {
      runner.runner(runAfterTimeout)
    }
    else if(typeof runner.fiberRunner === 'function') {
      Fiber(function() {
        runner.fiberRunner();
        runAfterTimeout();
      }).run()
    }
  }

  _.range(settings.clientCount || 1).map(performOperationForever)
}

setInterval(function() {
  var mem = process.memoryUsage()
  process.stdout.write([
    'MEMORY_USAGE',
    Date.now(),
    mem.heapTotal,
    mem.heapUsed
  ].join(' '))
}, 500)

