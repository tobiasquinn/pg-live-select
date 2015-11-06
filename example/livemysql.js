// pg-live-select example
var LiveMysql = require('../lib/LiveMysql');

// Initialize the live query processor
var liveDb = new LiveMysql({
  host: 'localhost',
  user: 'root',
  password: 'numtel',
  database: 'live_select_test',
  serverId: 349,
  minInterval: 200
});

// Create a live select instance
liveDb.select('SELECT * FROM pause_resume', [], {
  'pause_resume': function(row) {
    console.log('got row', row);
    return true;
  }
})
  .on('update', function(diff, data) {
    // Handle the changes here...
    console.log('updated', diff, data);
  });

// On Ctrl+C, remove triggers and exit
process.on('SIGINT', function() {
  liveDb.cleanup(process.exit);
});
