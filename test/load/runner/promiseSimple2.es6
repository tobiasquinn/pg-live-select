module.exports = function() {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, 1)
  })
}
