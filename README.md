# pg-live-select [![Build Status](https://travis-ci.org/numtel/pg-live-select.svg?branch=master)](https://travis-ci.org/numtel/pg-live-select)

NPM Package to provide events when a PostgreSQL `SELECT` statement result set changes.

Built using the [`node-postgres` NPM package](https://github.com/brianc/node-postgres).

**Postgres 9.3+ is required.**

*See also:*

* [Meteor Package for Reactive PostgreSQL](https://github.com/numtel/meteor-pg)
* [`mysql-live-select` NPM Package](https://github.com/numtel/mysql-live-select)

## Installation

```
npm install pg-live-select
```

## LivePg Class

The `LivePg` constuctor requires 2 arguments:

Constructor Argument | Type | Description
---------|------|---------------------------
`connStr` | `string` | Postgres connection string, ex. `postgres://user:pass@host/db`
`channel` | `string` | Unique identifier for this connection. Used as channel for `NOTIFY` commands as well as prefix for triggers, functions, and views. Must follow SQL naming rules: may only contain `a-z`, `A-Z`, `0-9`, and `_` and not begin with a number.

A single persistent client is used to listen for notifications. Result set refreshes obtain additional clients from the pool on-demand.

```javascript
var LivePg = require('pg-live-select');

// Instantiate LivePg class
var liveDb = new LivePG('postgres://user:pass@host/db', 'myapp');

// Create a live query
var highScores = liveDb
  .select('SELECT * FROM scores WHERE score > 10')
  .on('update', function(diff, data) {
    // diff: object containing differences since last update
    // data: array of full result set
    // This event will always be called at least once.
    // On initialization with an empty result set, diff.added == []
  });

// Stop query updates
highScores.stop();

// When exiting the application, remove all installed triggers
liveDb.cleanup(function() {
  // Database is now cleaned
});
```

See complete working example in [`example/livequery.js`](example/livequery.js).

The `LivePg` class inherits from `EventEmitter`, providing `error` events.

### LivePg.prototype.select(query, [params], [triggers])

Argument | Type | Description
---------|------|--------------------
`query` | `String` | `SELECT` SQL statement
`params` | `Array` | Optionally, pass an array of parameters to interpolate into the query safely. Paramaters in the `query` are denoted using `$<number>`, e.g. `$1` corresponds to `params[0]`. If omitted, `triggers` may occupy the second argument.
`triggers` | `Object` | Optionally, specify an object defining invalidation lamdba functions for specific tables. If omitted, the query results will be refreshed on any change to the query's dependent tables.

Returns `SelectHandle` object.

#### Trigger object definitions

The `triggers` argument object contains table names as the object's keys and result set data invalidation functions as values. Each function returns a boolean value determining whether the query results should be refreshed on account of the row that has changed.

* For `INSERT` operations, the new row is passed as the argument.
* For `UPDATE` operations, the function is called twice: once with the old row as the argument and once with the new row as the argument. If either returns true, the query results are updated.
* For `DELETE` operations, the old row is passed as the argument.

```javascript
// Simple live query with custom trigger
liveDb.select('SELECT * FROM scores WHERE score > $1', [ 10 ], {
  'scores': function(row) {
    return row.score > 10
  }
})
```

#### SelectHandle class

The `LivePG.prototype.select()` method returns an instance of the `SelectHandle` class that contains a `stop()` method for terminating updates to a live query.

The `SelectHandle` class inherits from `EventEmitter`, providing an `update` event on each result set change with two arguments: `diff` and `data`. `diff` contains a description of which rows have been `added`, `moved`, `removed`, and `copied`. `data` contains an array of the full result set.

An `error` event is emitted from the `SelectHandle` for initialization errors.

### LivePg.prototype.cleanup(callback)

Remove triggers and trigger function on application exit.

```javascript
// On Ctrl+C, remove triggers and exit
process.on('SIGINT', function() {
  liveDb.cleanup(process.exit);
});
```

## Getting started with the example

Run the following commands:

```bash
# Download dependent packages
$ npm install

# Load sample dataset into Postgres
psql databasename < example/sample-data.sql

# Configure the database connection string
vim example/livequery.js

# Start sample application
node example/livequery.js
```

## Perfoming Tests

Regression tests are performed using the `npm test` command.

Performance tests may be performed using the [`node-pg-mem-test` application](https://github.com/numtel/node-pg-mem-test).

## License

MIT
