var fs = require('fs');
var path = require('path');

var LivePg = require('./index');

var CONN_STR = 'postgres://meteor:meteor@127.0.0.1/meteor';

var QUERY = fs.readFileSync(path.join(__dirname, 'livequery.sql')).toString();

var liveDb = new LivePg(CONN_STR, 'mytest');

liveDb.select(QUERY, [ 1 ])
  .on('update', function(diff, data) {
    console.log(diff, data);
  });

process.on('SIGINT', function() {
  liveDb.cleanup(function(error) {
    console.log('out', error);
    process.exit();
  });
});
