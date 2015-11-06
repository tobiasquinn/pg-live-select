// pg-live-select, MIT License
var _ = require('lodash');

var subClasses = {
  'pg': require('./lib/LivePg'),
  'my': require('./lib/LiveMysql.js')
};

exports.connect = function(settings, options) {
  if(!(settings.mode in subClasses))
    throw new Error('INVALID_MODE_SPECIFIED');

  settings = _.clone(settings, true);

  var subClass = subClasses[settings.mode];
  delete settings.mode;
  var liveDb = new subClass(settings, options);

  return liveDb;
}

