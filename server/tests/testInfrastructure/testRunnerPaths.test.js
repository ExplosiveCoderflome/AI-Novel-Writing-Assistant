const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/run-tests.cjs'), 'utf8');

function runFixture(spawnResult = {status: 0}, {batch = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'director-test-runner-'));
  fs.mkdirSync(path.join(root, 'tests', 'nested'), {recursive: true});
  fs.writeFileSync(path.join(root, 'tests', 'nested', 'fixture.test.js'), '');
  if (batch) {
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(root, 'tests', 'nested', 'batched.test.js'), '');
    fs.writeFileSync(path.join(root, 'tests', 'nested', 'serial.test.js'), '');
    fs.writeFileSync(path.join(root, 'scripts', 'test-batches.json'), JSON.stringify({
      serialFiles: ['nested/serial.test.js'],
      batches: [{name: 'fixture', directories: [], files: ['nested/batched.test.js']}],
    }));
  }
  let invocation, exitCode;
  const invocations = [];
  const errors = [];
  vm.runInNewContext(source, {
    __dirname: path.join(root, 'scripts'),
    process: {argv: ['node', 'runner', 'all'], execPath: process.execPath, env: {}, exit(code) {exitCode = code;}},
    console: {error(message) {errors.push(message);}},
    require(name) {
      if (name === 'node:child_process') return {spawnSync(...args) {invocation = args; invocations.push(args); return spawnResult;}};
      return require(name);
    },
  });
  return {root, invocation, invocations, exitCode, errors};
}

test('test runner resolves file arguments from its cwd to avoid Windows command length failures', () => {
  const {root, invocation} = runFixture();
  assert.equal(invocation[2].cwd, root);
  const files = invocation[1].filter(arg => arg.endsWith('.test.js'));
  assert.equal(files.length, 1);
  assert.equal(path.isAbsolute(files[0]), false);
  assert.equal(fs.existsSync(path.resolve(root, files[0])), true);
  assert.equal(invocation[1].includes('--test-concurrency=4'), true);

  const batchRun = runFixture({status: 0}, {batch: true});
  assert.equal(batchRun.invocations.length, 3);
  assert.equal(batchRun.invocations[0][1].includes('--test-isolation=none'), true);
  assert.equal(batchRun.invocations[0][1].includes('--test-concurrency=1'), true);
  assert.equal(batchRun.invocations[1][1].includes('--test-isolation=process'), true);
  assert.equal(batchRun.invocations[1][1].includes('--test-concurrency=1'), true);
  assert.equal(batchRun.invocations[2][1].includes('--test-isolation=process'), true);
  assert.equal(batchRun.invocations[2][1].includes('--test-concurrency=4'), true);
});

test('test runner reports process startup failure rather than producing an empty failed run', () => {
  const {exitCode, errors} = runFixture({status: null, error: new Error('spawn E2BIG')});
  assert.equal(exitCode, 1);
  assert.equal(errors.some(message => message.includes('spawn E2BIG')), true);
});
