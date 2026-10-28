// A stand-in for Cloudflare D1 over Node's built-in SQLite (D1 is SQLite too), so the real
// Worker code runs against the real schema in tests. Covers the parts of the D1 API the
// Worker uses: prepare/bind/first/all/run and batch (one transaction).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }

  private stmt() {
    return this.db.prepare(this.sql);
  }

  async first<T>() {
    return (this.stmt().get(...(this.params as never[])) as T) ?? null;
  }

  async all<T>() {
    return { results: this.stmt().all(...(this.params as never[])).map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const r = this.stmt().run(...(this.params as never[]));
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
}

export function testDb(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(stmts: Statement[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.runSync());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  } as unknown as D1Database;
}
