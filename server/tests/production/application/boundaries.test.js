const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('public production facade has no transitive global database connection', () => {
  const Module = require('node:module');
  const original = Module._load;
  Module._load = function(name, parent, isMain) {
    const resolved = Module._resolveFilename(name, parent);
    assert.ok(!String(resolved).replaceAll('\\', '/').endsWith('/db/prisma.js'), 'importing production must not open the business database');
    return original.call(this, name, parent, isMain);
  };
  try { require('../../../dist/modules/production'); }
  finally { Module._load = original; }
});

test('production module imports no director, workflow, short story or global database connection', () => {
  const root = path.resolve(__dirname, '../../../src/modules/production');
  const files = [];
  function collect(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) collect(file);
      else if (item.name.endsWith('.ts')) files.push(file);
    }
  }
  collect(root);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.split('\n').length <= 400, `oversized production source: ${file}`);
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const imported = node.moduleSpecifier.text;
        const target = imported.startsWith('.') ? path.resolve(path.dirname(file), imported).replaceAll('\\', '/') : imported;
        assert.ok(!['/modules/director', '/services/novel/director', '/modules/novel/director-routing', '/services/novel/workflow', '/modules/novel/short-story', '/db/prisma'].some(item => target.includes(item)), `forbidden production import: ${target}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});
