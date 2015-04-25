
module.exports = async function() {
  await delay(1)
}

function delay(duration) {
  return new Promise(resolve => setTimeout(resolve, duration))
}

