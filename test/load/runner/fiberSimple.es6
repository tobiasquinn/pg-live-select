var Future = require('fibers/future')

exports.fiberRunner = function() {
  var fut = new Future

  setTimeout(function() {
    fut['return']()
  }, 1)

  return fut.wait()
}
