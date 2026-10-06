const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/run-tests.cjs'), 'utf8');

function runFixture(spawnResult = {status: 0}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'director-test-runner-'));
  fs.mkdirSync(path.join(root, 'tests', 'nested'), {recursive: true});
  fs.writeFileSync(path.join(root, 'tests', 'nested', 'fixture.test.js'), '');
  let invocation, exitCode;
  const errors = [];
  vm.runInNewContext(source, {
    __dirname: path.join(root, 'scripts'),
    process: {argv: ['node', 'runner', 'all'], execPath: process.execPath, exit(code) {exitCode = code;}},
    console: {error(message) {errors.push(message);}},
    require(name) {
      if (name === 'node:child_process') return {spawnSync(...args) {invocation = args; return spawnResult;}};
      return require(name);
    },
  });
  return {root, invocation, exitCode, errors};
}

test('test runner resolves file arguments from its cwd to avoid Windows command length failures', () => {
  const {root, invocation} = runFixture();
  assert.equal(invocation[2].cwd, root);
  const files = invocation[1].filter(arg => arg.endsWith('.test.js'));
  assert.equal(files.length, 1);
  assert.equal(path.isAbsolute(files[0]), false);
  assert.equal(fs.existsSync(path.resolve(root, files[0])), true);
  assert.equal(invocation[1].includes('--test-concurrency=4'), true);
});

test('test runner reports process startup failure rather than producing an empty failed run', () => {
  const {exitCode, errors} = runFixture({status: null, error: new Error('spawn E2BIG')});
  assert.equal(exitCode, 1);
  assert.equal(errors.some(message => message.includes('spawn E2BIG')), true);
});
