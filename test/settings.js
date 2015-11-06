
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
