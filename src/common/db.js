'use strict'

require('./promisify')

const sqlite = require('sqlite3')
const { EventEmitter } = require('events')
const { Migration } = require('./migration')
const { normalize } = require('path')
const Bluebird = require('bluebird')
const { using } = Bluebird
const { readFile: read } = require('fs').promises
const { createPool } = require('generic-pool')
const { debug, info, trace, warn } = require('./log')

const M = {
  'r': sqlite.OPEN_READONLY,
  'w': sqlite.OPEN_READWRITE,
  'w+': sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE,
  'wx+': sqlite.OPEN_CREATE
}

const cache = {}


class Database extends EventEmitter {

  static async create(path, script, ...args) {
    try {
      var db = new Database(path, 'w+', { max: 1 })

      let isEmpty = await db.empty()
      if (isEmpty && script) await script(db, ...args)

      return db.path

    } finally {
      if (db) await db.close()
    }
  }

  static cached(path) {
    path = normalize(path)

    if (!cache[path]) {
      cache[path] = new Database(path, 'w')
        .once('close', () => { cache[path] = null })
    }

    return cache[path]
  }

  constructor(path = ':memory:', mode = 'w+', opts = {}) {
    debug({ path, mode }, 'init db')
    super()

    this.path = path

    this.pool = createPool({
      create: () => this.create(mode),
      destroy: (conn) => this.destroy(conn)
    }, {
      min: 0,
      max: 3,
      idleTimeoutMillis: 1000 * 60 * 5,
      acquireTimeoutMillis: 1000 * 10,
      Promise: Bluebird,
      ...opts
    })
  }

  migrate = async (...args) => {
    let version = await this.version()
    let migrations = await Migration.since(version, ...args)

    for (let migration of migrations) {
      await migration.up(this)
    }

    return migrations
  }

  get busy() {
    return this.pool.size - this.pool.available
  }

  create(mode) {
    return new Promise((resolve, reject) => {
      info(`open db ${this.path}`)

      let db = new sqlite.Database(this.path, M[mode], (error) => {
        if (error) {
          this.emit('error', error)
          return reject(error)
        }

        new Connection(db)
          .configure()
          .tap(() => this.emit('create'))
          .then(resolve, reject)
      })

      // db.on('trace', query => trace(query))

      db.on('profile', (query, ms) => {
        let msg = `db query took ${ms}ms`

        if (ms > 150) {
          return warn({ query, ms }, `SLOW: ${msg}`)
        }

        if (ms > 50) {
          return info({ msg, query, ms })
        }

        trace({ msg, query, ms })
      })
    })
  }

  async destroy(conn) {
    debug({ path: this.path }, 'close db')

    await conn.optimize()
    await conn.close()

    this.emit('destroy')
  }

  acquire() {
    return this.pool.acquire()
      .disposer(conn => this.release(conn))
  }

  release(conn) {
    conn.parallelize()
    return this.pool.release(conn)
  }


  close = async () => {
    await this.pool.drain()
    await this.pool.clear()

    this.emit('close')
  }

  empty = async () => {
    const { count } = await this.get(`
      SELECT count(*) AS count FROM sqlite_master`)

    return count === 0
  }

  seq = (fn) =>
    using(this.acquire(), fn)

  transaction = (fn) =>
    this.seq(conn => using(transaction(conn), fn))


  /*
   * Migrations are special transactions which can be used for schema
   * changes, as explained at https://www.sqlite.org/lang_altertable.html
   *
   *   1. Disable foreign keys
   *   2. Start exclusive transaction
   *   3. fn
   *   4. Check foreign key constraints
   *   5. Commit or rollback transaction
   *   6. Enable foreign keys
   */
  migration = (fn) =>
    this.seq(conn =>
      using(nofk(conn), conn =>
        using(transaction(conn, 'EXCLUSIVE'), tx =>
          Bluebird.resolve(fn(tx)).then(() => tx.check()))))


  prepare(...args) {
    let fn = args.pop()

    return this.seq(conn =>
      using(Statement.disposable(conn, ...args), stmt => fn(stmt, conn)))
  }


  all(...args) {
    return this.seq(conn => conn.all(...args))
  }

  each(...args) {
    return this.seq(conn => conn.each(...args))
  }

  get(...args) {
    return this.seq(conn => conn.get(...args))
  }

  run(...args) {
    return this.seq(conn => conn.run(...args))
  }

  exec(...args) {
    return this.seq(conn => conn.exec(...args)).return(this)
  }


  version(...args) {
    return this.seq(conn => conn.version(...args))
  }

  async read(file) {
    return this.exec(String(await read(file)))
  }
}


Database.defaults = {
  application_id: '0xDAEDA105',
  encoding: 'UTF-8'
}


class Connection {
  constructor(db) {
    this.db = db
  }

  configure(pragma = Connection.defaults) {
    return this.exec(
      Object
        .entries(pragma)
        .map(nv => `PRAGMA ${nv.join(' = ')};`)
        .join('\n'))
  }

  optimize() {
    return this.exec('PRAGMA optimize;')
  }

  close() {
    return this.db.closeAsync()
  }

  parallelize(...args) {
    return this.db.parallelize(...args), this
  }

  serialize(...args) {
    return this.db.serialize(...args), this
  }

  prepare(...args) {
    const fn = args.pop()
    return using(Statement.disposable(this, ...args), stmt => fn(stmt, this))
  }

  all(sql, ...params) {
    return this.db.allAsync(sql, flatten(params))
  }

  each(...args) {
    return this.db.eachAsync(...args)
  }

  get(sql, ...params) {
    return this.db.getAsync(sql, flatten(params))
  }

  run(sql, ...params) {
    return this.db.runAsync(sql, flatten(params))
  }

  exec(sql) {
    return this.db.execAsync(sql).return(this)
  }


  version(version) {
    return (version) ?
      this.exec(`PRAGMA user_version = ${version}`) :
      this.get('PRAGMA user_version').get('user_version')
  }

  begin(mode = 'IMMEDIATE') {
    return this.exec(`BEGIN ${mode} TRANSACTION`)
  }

  commit() {
    return this.exec('COMMIT TRANSACTION')
  }

  rollback() {
    return this.exec('ROLLBACK TRANSACTION')
  }

  check(table) {
    return this
      .all(`PRAGMA foreign_key_check${table ? `('${table}')` : ''}`)
      .then(stack => {
        if (!stack.length)
          return this

        warn({ stack }, 'foreign key check failed!')
        throw new Error(`${stack.length} foreign key check(s) failed`)
      })
  }
}


Connection.defaults = {
  busy_timeout: 5000,
  foreign_keys: 'on'
}


class Statement {

  static disposable(conn, sql, ...params) {
    return conn.db.prepareAsync(sql, flatten(params))
      .then(stmt => new Statement(stmt))
      .disposer(stmt => stmt.finalize())
  }

  constructor(stmt) {
    this.stmt = stmt
  }

  bind(...params) {
    return this.stmt.bindAsync(flatten(params)).return(this)
  }

  reset() {
    return this.stmt.resetAsync().return(this)
  }

  finalize() {
    return this.stmt.finalizeAsync().return(this)
  }

  run(...params) {
    return this.stmt.runAsync(flatten(params))
  }

  get(...params) {
    return this.stmt.getAsync(flatten(params))
  }

  all(...params) {
    return this.stmt.allAsync(flatten(params))
  }

  each(...args) {
    return this.stmt.eachAsync(...args)
  }
}


function nofk(conn) {
  return conn
    .configure({ foreign_keys: 'off' })
    .disposer(() => conn.configure({ foreign_keys: 'on' }))
}

function transaction(conn, mode = 'IMMEDIATE') {
  return conn
    .begin(mode)
    .disposer((tx, p) => p.isFulfilled() ? tx.commit() : tx.rollback())
}

function flatten(params) {
  return (params.length === 1) ? params[0] : params
}

module.exports = { Database, Connection, Statement, transaction }
