const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '..');
const testsDir = path.join(clientRoot, 'tests');

function listTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  list.forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listTestFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.test.js') || entry.name.endsWith('.test.mjs'))) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = listTestFiles(testsDir);

if (files.length === 0) {
  console.log('No client test files found.');
  process.exit(0);
}

console.log(`Running ${files.length} client test files...`);

const result = spawnSync(process.execPath, ['--import', './tests/setup.mjs', '--loader', './tests/ts-loader.mjs', '--test', ...files], {
  cwd: clientRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
