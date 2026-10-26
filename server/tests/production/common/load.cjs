const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../../../dist/modules/production/common/index.js');
const common = fs.existsSync(target) ? require(target) : {};
module.exports = function api(name) {
  assert.equal(typeof common[name], 'function', `${name} must be exported`);
  return common[name];
};
