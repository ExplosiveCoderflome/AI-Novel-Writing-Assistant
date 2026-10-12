import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectDirectorProjectionSources} from './projectionGuard.mjs';

const clientRoot=fileURLToPath(new URL('../../',import.meta.url));
const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'director-projection-mutation-'));
fs.symlinkSync(path.join(clientRoot,'node_modules'),path.join(temporaryRoot,'node_modules'),'junction');
const sourceRoot=path.join(temporaryRoot,'src');
for(const root of ['components/directorNext','pages/directorNext'])fs.cpSync(path.join(clientRoot,'src',root),path.join(sourceRoot,root),{recursive:true});
const run=()=>spawnSync(process.execPath,['--experimental-strip-types','--test','--test-name-pattern=the projection guard also rejects a third rendering component',path.join(clientRoot,'tests/directorNext.test.js')],
 {cwd:clientRoot,env:{...process.env,DIRECTOR_PROJECTION_SOURCE_ROOT:sourceRoot},encoding:'utf8',timeout:30000});
const baseline=run();
assert.equal(baseline.status,0,baseline.stdout+baseline.stderr);
const file=path.join(sourceRoot,'pages/directorNext/ThirdDirectorPanel.tsx');
fs.writeFileSync(file,`import type {DashboardView} from '@/api/directorNext';
export function Third({dashboard}:{dashboard:DashboardView}) {
 const state=dashboard;
 const alias={...state};
 const {mode: phase}=state;
 const headline=state['headline'];
 return <>{phase}{headline}{alias.progress.done}{state?.availableActions.length}{state.sourceTrace.controlVersion}</>;
}`);
const fields=new Set(inspectDirectorProjectionSources(sourceRoot).filter(row=>row.file.endsWith('ThirdDirectorPanel.tsx')).map(row=>row.field));
for(const field of ['mode','headline','progress','availableActions','sourceTrace'])assert.ok(fields.has(field),'guard missed '+field);
const mutation=run(),output=mutation.stdout+mutation.stderr;
fs.writeFileSync(path.join(temporaryRoot,'mutation.log'),output);
assert.notEqual(mutation.status,0,'the test must reject the added third presenter');
assert.match(output,/AssertionError|ERR_ASSERTION/);
fs.writeFileSync(path.join(temporaryRoot,'report.json'),JSON.stringify({baseline:'pass',mutation:'caught',fields:[...fields]},null,2));
console.log('Third presenter mutation: caught');
console.log('REPORT '+path.join(temporaryRoot,'report.json'));
