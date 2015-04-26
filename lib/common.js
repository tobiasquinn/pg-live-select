'use strict';

var Future = require('fibers/future');
var _ = require('lodash');
var pg = require('pg');
var randomString = require('random-strings');

var collectionDiff = require('./collectionDiff');

module.exports = exports = {

  /**
   * Obtain a node-postgres client from the connection pool
   * @param  String  connectionString "postgres://user:pass@host/database"
   * @return { client, done() } Call done() to return client to pool!
   */
  getClient: function getClient(connectionString) {
    var fut = new Future();
    pg.connect(connectionString, function (error, client, done) {
      if (error) fut['throw'](error);else fut['return']({ client: client, done: done });
    });
    return fut.wait();
  },

  /**
   * Perform a query
   * @param  Object client node-postgres client
   * @param  String query  SQL statement
   * @param  Array  params Optional, values to substitute into query
   *                       (params[0] => '$1'...)
   * @return Array         Result set
   */
  performQuery: function performQuery(client, query) {
    var params = arguments[2] === undefined ? [] : arguments[2];

    var fut = new Future();
    client.query(query, params, function (error, result) {
      if (error) fut['throw'](error);else fut['return'](result);
    });
    return fut.wait();
  },

  delay: function delay() {
    var duration = arguments[0] === undefined ? 0 : arguments[0];

    var fut = new Future();
    setTimeout(function () {
      return fut['return']();
    }, duration);
    return fut.wait();
  },

  /**
   * Query information_schema to determine tables used
   * @param  Object client node-postgres client
   * @param  String query  SQL statement, params not used
   * @return Array         Table names
   * TODO change to EXPLAIN?
   */
  getQueryDetails: function getQueryDetails(client, query) {
    var nullifiedQuery = query.replace(/\$\d+/g, 'NULL');
    var viewName = 'tmp_view_' + randomString.alphaLower(10);

    exports.performQuery(client, 'CREATE OR REPLACE TEMP VIEW ' + viewName + ' AS (' + nullifiedQuery + ')');

    var tablesResult = exports.performQuery(client, 'SELECT DISTINCT vc.table_name\n        FROM information_schema.view_column_usage vc\n        WHERE view_name = $1', [viewName]);

    exports.performQuery(client, 'DROP VIEW ' + viewName);

    return tablesResult.rows.map(function (row) {
      return row.table_name;
    });
  },

  /**
   * Create a trigger to send NOTIFY on any change with payload of table name
   * @param  Object client  node-postgres client
   * @param  String table   Name of table to install trigger
   * @param  String channel NOTIFY channel
   * @return true           Successful
   * TODO notification pagination at 8000 bytes
   */
  createTableTrigger: function createTableTrigger(client, table, channel) {
    var triggerName = '' + channel + '_' + table;

    var payloadTpl = '\n      SELECT\n        \'' + table + '\'  AS table,\n        TG_OP       AS op,\n        json_agg($ROW$) AS data\n      INTO row_data;\n    ';
    var payloadNew = payloadTpl.replace(/\$ROW\$/g, 'NEW');
    var payloadOld = payloadTpl.replace(/\$ROW\$/g, 'OLD');
    var payloadChanged = '\n      SELECT\n        \'' + table + '\'  AS table,\n        TG_OP       AS op,\n        json_agg(NEW) AS new_data,\n        json_agg(OLD) AS old_data\n      INTO row_data;\n    ';

    exports.performQuery(client, 'CREATE OR REPLACE FUNCTION ' + triggerName + '() RETURNS trigger AS $$\n        DECLARE\n          row_data   RECORD;\n          full_msg   TEXT;\n          full_len   INT;\n          cur_page   INT;\n          page_count INT;\n          msg_hash   TEXT;\n        BEGIN\n          IF (TG_OP = \'INSERT\') THEN\n            ' + payloadNew + '\n          ELSIF (TG_OP  = \'DELETE\') THEN\n            ' + payloadOld + '\n          ELSIF (TG_OP = \'UPDATE\') THEN\n            ' + payloadChanged + '\n          END IF;\n\n          SELECT row_to_json(row_data)::TEXT INTO full_msg;\n          SELECT char_length(full_msg)       INTO full_len;\n          SELECT (full_len / 7950) + 1       INTO page_count;\n          SELECT md5(full_msg)               INTO msg_hash;\n\n          FOR cur_page IN 1..page_count LOOP\n            PERFORM pg_notify(\'' + channel + '\',\n              msg_hash || \':\' || page_count || \':\' || cur_page || \':\' ||\n              substr(full_msg, ((cur_page - 1) * 7950) + 1, 7950)\n            );\n          END LOOP;\n          RETURN NULL;\n        END;\n      $$ LANGUAGE plpgsql');

    exports.performQuery(client, 'DROP TRIGGER IF EXISTS "' + triggerName + '"\n        ON "' + table + '"');

    exports.performQuery(client, 'CREATE TRIGGER "' + triggerName + '"\n        AFTER INSERT OR UPDATE OR DELETE ON "' + table + '"\n        FOR EACH ROW EXECUTE PROCEDURE ' + triggerName + '()');

    return true;
  },

  /**
   * Drop matching function and trigger for a table
   * @param  Object client  node-postgres client
   * @param  String table   Name of table to remove trigger
   * @param  String channel NOTIFY channel
   * @return true           Successful
   */
  dropTableTrigger: function dropTableTrigger(client, table, channel) {
    var triggerName = '' + channel + '_' + table;

    exports.performQuery(client, 'DROP TRIGGER IF EXISTS ' + triggerName + ' ON ' + table);

    exports.performQuery(client, 'DROP FUNCTION IF EXISTS ' + triggerName + '()');

    return true;
  },

  /**
   * Perform SELECT query, obtaining difference in result set
   * @param  Object  client      node-postgres client
   * @param  Array   currentData Last known result set for this query/params
   * @param  String  query       SQL SELECT statement
   * @param  Array   params      Optionally, pass an array of parameters
   * @return Object              Enumeration of differences
   */
  getResultSetDiff: function getResultSetDiff(client, currentData, query, params) {
    var oldHashes = currentData.map(function (row) {
      return row._hash;
    });

    var result = exports.performQuery(client, '\n      WITH\n        res AS (' + query + '),\n        data AS (\n          SELECT\n            res.*,\n            MD5(CAST(ROW_TO_JSON(res.*) AS TEXT)) AS _hash,\n            ROW_NUMBER() OVER () AS _index\n          FROM res),\n        data2 AS (\n          SELECT\n            1 AS _added,\n            data.*\n          FROM data\n          WHERE _hash NOT IN (\'' + oldHashes.join('\',\'') + '\'))\n      SELECT\n        data2.*,\n        data._hash AS _hash\n      FROM data\n      LEFT JOIN data2\n        ON (data._index = data2._index)', params);

    var diff = collectionDiff(oldHashes, result.rows);

    if (diff === null) {
      return null;
    }var newData = exports.applyDiff(currentData, diff);

    return { diff: diff, data: newData };
  },

  /**
   * Apply a diff to a result set
   * @param  Array  data Last known full result set
   * @param  Object diff Output from getResultSetDiff()
   * @return Array       New result set
   */
  applyDiff: function applyDiff(data, diff) {
    var newResults = data.slice();

    diff.removed !== null && diff.removed.forEach(function (removed) {
      return newResults[removed._index - 1] = undefined;
    });

    // Deallocate first to ensure no overwrites
    diff.moved !== null && diff.moved.forEach(function (moved) {
      newResults[moved.old_index - 1] = undefined;
    });

    diff.copied !== null && diff.copied.forEach(function (copied) {
      var copyRow = _.clone(data[copied.orig_index - 1]);
      copyRow._index = copied.new_index;
      newResults[copied.new_index - 1] = copyRow;
    });

    diff.moved !== null && diff.moved.forEach(function (moved) {
      var movingRow = data[moved.old_index - 1];
      movingRow._index = moved.new_index;
      newResults[moved.new_index - 1] = movingRow;
    });

    diff.added !== null && diff.added.forEach(function (added) {
      return newResults[added._index - 1] = added;
    });

    return newResults.filter(function (row) {
      return row !== undefined;
    });
  } };