const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Database = require('better-sqlite3');

test('quality workers receive a fresh database already in WAL mode before parallel startup', () => {
  const script = path.resolve(__dirname, '../../scripts/quality/run-gate.cjs');
  const realRequire = createRequire(script);
  let directory;
  let invocations = 0;
  try {
    vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
      __dirname: path.dirname(script), console,
      process: { env: { ...process.env, DATABASE_URL: 'file:must-not-touch.db' }, execPath: process.execPath,
        exit(code) { throw Error('unexpected exit: ' + code); } },
      require(id) {
        if (id !== 'node:child_process') return realRequire(id);
        return { spawnSync(_executable, _args, options) {
          directory = options.env.AI_NOVEL_APP_DATA_DIR;
          assert.equal(fs.realpathSync(path.dirname(directory)), fs.realpathSync(os.tmpdir()));
          assert.ok(path.basename(directory).startsWith('ai-novel-quality-'));
          const filename = options.env.DATABASE_URL.slice('file:'.length);
          const database = new Database(filename, { readonly: true, fileMustExist: true });
          try { assert.equal(database.pragma('journal_mode', { simple: true }), 'wal'); }
          finally { database.close(); }
          invocations++;
          return { status: 0 };
        } };
      },
    }, { filename: script });
    assert.equal(invocations, 2);
  } finally {
    if (directory) {
      assert.equal(fs.realpathSync(path.dirname(directory)), fs.realpathSync(os.tmpdir()));
      assert.ok(path.basename(directory).startsWith('ai-novel-quality-'));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});
