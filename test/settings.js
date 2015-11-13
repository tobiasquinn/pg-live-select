
module.exports = {
  pg: {
    mode: 'pg',
    connStr: 'postgres://meteor:meteor@127.0.0.1/meteor_test',
    channel: 'package_test'
  },
  my: {
    mode: 'my',
    host: 'localhost',
    user: 'root',
    password: 'numtel',
    database: 'live_select_test',
    serverId: 349
  }
}

if(process.env.TRAVIS) {
  // Provide modified connection settings for Travis CI
  module.exports.pg.connStr = 'postgres://postgres@127.0.0.1/travis_ci_test';
  module.exports.pg.channel = 'travis_channel';

  module.exports.my.password = '';
  module.exports.my.port = process.env.TEST_MYSQL_PORT * 1;
  module.exports.my.database = 'travis_test';
}
