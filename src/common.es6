var Future       = require('fibers/future')
var _            = require('lodash')
var pg           = require('pg')
var randomString = require('random-strings')

var collectionDiff = require('./collectionDiff')

module.exports = exports = {

  /**
   * Obtain a node-postgres client from the connection pool
   * @param  String  connectionString "postgres://user:pass@host/database"
   * @return { client, done() } Call done() to return client to pool!
   */
  getClient(connectionString) {
    var fut = new Future
    pg.connect(connectionString, (error, client, done) => {
      if(error) fut.throw(error)
      else fut.return({ client, done })
    })
    return fut.wait()
  },

  /**
   * Perform a query
   * @param  Object client node-postgres client
   * @param  String query  SQL statement
   * @param  Array  params Optional, values to substitute into query
   *                       (params[0] => '$1'...)
   * @return Array         Result set
   */
  performQuery(client, query, params=[]) {
    var fut = new Future
    client.query(query, params, (error, result) => {
      if(error) fut.throw(error)
      else fut.return(result)
    })
    return fut.wait()
  },

  delay(duration=0) {
    var fut = new Future
    setTimeout(() => fut.return(), duration)
    return fut.wait()
  },

  /**
   * Query information_schema to determine tables used
   * @param  Object client node-postgres client
   * @param  String query  SQL statement, params not used
   * @return Array         Table names
   * TODO change to EXPLAIN?
   */
  getQueryDetails(client, query) {
    var nullifiedQuery = query.replace(/\$\d+/g, 'NULL')
    var viewName = `tmp_view_${randomString.alphaLower(10)}`

    exports.performQuery(client,
      `CREATE OR REPLACE TEMP VIEW ${viewName} AS (${nullifiedQuery})`)

    var tablesResult = exports.performQuery(client,
      `SELECT DISTINCT vc.table_name
        FROM information_schema.view_column_usage vc
        WHERE view_name = $1`, [ viewName ])

    exports.performQuery(client, `DROP VIEW ${viewName}`)

    return tablesResult.rows.map(row => row.table_name)
  },

  /**
   * Create a trigger to send NOTIFY on any change with payload of table name
   * @param  Object client  node-postgres client
   * @param  String table   Name of table to install trigger
   * @param  String channel NOTIFY channel
   * @return true           Successful
   */
  createTableTrigger(client, table, channel) {
    var triggerName = `${channel}_${table}`

    var payloadTpl = `
      SELECT
        '${table}'  AS table,
        TG_OP       AS op,
        json_agg($ROW$) AS data
      INTO row_data;
    `
    var payloadNew = payloadTpl.replace(/\$ROW\$/g, 'NEW')
    var payloadOld = payloadTpl.replace(/\$ROW\$/g, 'OLD')
    var payloadChanged = `
      SELECT
        '${table}'  AS table,
        TG_OP       AS op,
        json_agg(NEW) AS new_data,
        json_agg(OLD) AS old_data
      INTO row_data;
    `

    exports.performQuery(client,
      `CREATE OR REPLACE FUNCTION ${triggerName}() RETURNS trigger AS $$
        DECLARE
          row_data   RECORD;
          full_msg   TEXT;
          full_len   INT;
          cur_page   INT;
          page_count INT;
          msg_hash   TEXT;
        BEGIN
          IF (TG_OP = 'INSERT') THEN
            ${payloadNew}
          ELSIF (TG_OP  = 'DELETE') THEN
            ${payloadOld}
          ELSIF (TG_OP = 'UPDATE') THEN
            ${payloadChanged}
          END IF;

          SELECT row_to_json(row_data)::TEXT INTO full_msg;
          SELECT char_length(full_msg)       INTO full_len;
          SELECT (full_len / 7950) + 1       INTO page_count;
          SELECT md5(full_msg)               INTO msg_hash;

          FOR cur_page IN 1..page_count LOOP
            PERFORM pg_notify('${channel}',
              msg_hash || ':' || page_count || ':' || cur_page || ':' ||
              substr(full_msg, ((cur_page - 1) * 7950) + 1, 7950)
            );
          END LOOP;
          RETURN NULL;
        END;
      $$ LANGUAGE plpgsql`)

    exports.performQuery(client,
      `DROP TRIGGER IF EXISTS "${triggerName}"
        ON "${table}"`)

    exports.performQuery(client,
      `CREATE TRIGGER "${triggerName}"
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE PROCEDURE ${triggerName}()`)

    return true
  },

  /**
   * Drop matching function and trigger for a table
   * @param  Object client  node-postgres client
   * @param  String table   Name of table to remove trigger
   * @param  String channel NOTIFY channel
   * @return true           Successful
   */
  dropTableTrigger(client, table, channel) {
    var triggerName = `${channel}_${table}`

    exports.performQuery(client,
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`)

    exports.performQuery(client,
      `DROP FUNCTION IF EXISTS ${triggerName}()`)

    return true
  },

  /**
   * Perform SELECT query, obtaining difference in result set
   * @param  Object  client      node-postgres client
   * @param  Array   currentData Last known result set for this query/params
   * @param  String  query       SQL SELECT statement
   * @param  Array   params      Optionally, pass an array of parameters
   * @return Object              Enumeration of differences
   */
  getResultSetDiff(client, currentData, query, params) {
    var oldHashes = currentData.map(row => row._hash)

    var result = exports.performQuery(client, `
      WITH
        res AS (${query}),
        data AS (
          SELECT
            res.*,
            MD5(CAST(ROW_TO_JSON(res.*) AS TEXT)) AS _hash,
            ROW_NUMBER() OVER () AS _index
          FROM res),
        data2 AS (
          SELECT
            1 AS _added,
            data.*
          FROM data
          WHERE _hash NOT IN ('${oldHashes.join("','")}'))
      SELECT
        data2.*,
        data._hash AS _hash
      FROM data
      LEFT JOIN data2
        ON (data._index = data2._index)`, params)

    var diff = collectionDiff(oldHashes, result.rows)

    if(diff === null) return null

    var newData = exports.applyDiff(currentData, diff)

    return { diff, data: newData }
  },

  /**
   * Apply a diff to a result set
   * @param  Array  data Last known full result set
   * @param  Object diff Output from getResultSetDiff()
   * @return Array       New result set
   */
  applyDiff(data, diff) {
    var newResults = data.slice()

    diff.removed !== null && diff.removed
      .forEach(removed => newResults[removed._index - 1] = undefined)

    // Deallocate first to ensure no overwrites
    diff.moved !== null && diff.moved.forEach(moved => {
      newResults[moved.old_index - 1] = undefined
    })

    diff.copied !== null && diff.copied.forEach(copied => {
      var copyRow = _.clone(data[copied.orig_index - 1])
      copyRow._index = copied.new_index
      newResults[copied.new_index - 1] = copyRow
    })

    diff.moved !== null && diff.moved.forEach(moved => {
      var movingRow = data[moved.old_index - 1]
      movingRow._index = moved.new_index
      newResults[moved.new_index - 1] = movingRow
    })

    diff.added !== null && diff.added
      .forEach(added => newResults[added._index - 1] = added)

    return newResults.filter(row => row !== undefined)
  },

}

