var fs = require('fs')
var spawn = require('child_process').spawn

var _ = require('lodash')

var cases = {
  // arrays of assign counts
  'static': [ 10, 20, 30 ],
  'common.performQuery.scoresLoadDiff': [ 5, 19, 20, 21, 25 ]
}


// Run each case for set time
const DURATION = 15 * 60 * 1000

function runCase(caseName, assignCount) {
  return new Promise((resolve, reject) => {
    var args = [
      'test/load/',
      '--conn',
      options.conn,
      '--channel',
      options.channel,
      '--case',
      caseName,
      '--assign_count',
      assignCount,
      '--output',
      `test/load/viewer/${caseName}.${assignCount}.${DURATION / 1000}.json`
    ]
    console.log(args.join(' '))

    var child = spawn('node', args)

    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)

    var timeout = setTimeout(() => {
      child.kill('SIGINT')
    }, DURATION)

    child.on('close', code => {
      clearTimeout(timeout)
      console.log('exited with code', code)
      resolve(code)
    })
  })
}

async function runAll() {
  for(let caseName of Object.keys(cases)) {
    for(let assignCount of cases[caseName]) {
      await runCase(caseName, assignCount)
    }
  }
}

runAll()
