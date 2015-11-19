var testCount = 0

module.exports = {
  setUp: function(done) {
    testCount++
    done()
  },

  tearDown: function(done) {
    // Allow 1 second for next test to begin, otherwise quit
    var startCount = testCount

    setTimeout(function(){
      if(startCount === testCount){
        if(global.liveDb) liveDb.cleanup(process.exit)
        else process.exit()
      }
    }, 1000)

    done()
  }
}
