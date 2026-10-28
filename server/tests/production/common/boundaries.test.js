const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('common is self-contained, IO-free and bounded; integration test stays outside fast group', () => {
  const root = path.resolve(__dirname, '../../../src/modules/production/common');
  for (const entry of fs.readdirSync(root).filter(file => file.endsWith('.ts'))) {
    const file = path.join(root, entry);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.split('\n').length <= 400, `${entry} exceeds file boundary`);
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        assert.ok(node.moduleSpecifier.text.startsWith('./'), `common import escapes its owner: ${node.moduleSpecifier.text}`);
      }
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(ast);
        assert.ok(!['fetch', 'require', 'Date.now', 'Math.random', 'setTimeout', 'setInterval', 'process.exit'].includes(name), `effectful common call: ${name}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const runner = fs.readFileSync(path.resolve(__dirname, '../../../scripts/run-tests.cjs'), 'utf8');
  assert.ok(runner.includes('"productionKernelProgressSqlite.test.js"'));
});
