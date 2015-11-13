// pg-live-select example
var liveSql = require('../');

// Initialize the live query processor
var liveDb = liveSql.connect({
//   mode: 'pg',
//   connStr: 'postgres://meteor:meteor@127.0.0.1/meteor_test'
  mode: 'my',
  host: 'localhost',
  user: 'root',
  password: 'numtel',
  database: 'live_select_test',
  serverId: 350
}, {
  diff: 'deep'
});

// Create a live select instance
liveDb.select('SELECT * FROM assignments ORDER BY value DESC', {
  'assignments': function(row) {
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
