const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const entry = path.resolve(__dirname, '../../../dist/modules/production/domain/index.js');
const domain = fs.existsSync(entry) ? require(entry) : {};
function call(name, ...args) {
  assert.equal(typeof domain[name], 'function', `Missing production domain capability: ${name}`);
  return domain[name](...args);
}
const stages = ['prepare','draft','accept','repair','verify','select','commit','reconcile'];
function profile(overrides = {}) {
  return { id:'long_chapter@1', stages, repair:{maxAttempts:1,mode:'light_repair'}, context:'chapter_context@1',
    reconcile:'adaptive', outputBudgets:{draft:8000,accept:4096,verify:6144}, capabilities:[], ...overrides };
}
const policy = {blockingAction:'continue_with_warning'};
const unit = {novelId:'book',chapterId:'chapter',order:1};
function verdict(hash='original', overrides={}) {
  return {contentHash:hash,gateAvailable:true,issues:[],missingObligations:[],replan:'none',...overrides};
}
const issue = (code='continuity', severity='high', patchable=true)=>({code,severity,patchable});
function progress(overrides={}) {
  return {unit,completed:['prepare','draft','accept'],repairAttemptsUsed:0,
    original:{contentHash:'original',verdict:verdict()},...overrides};
}
function next(p, config=profile(), issuePolicy=policy) {return call('decideNext',{unit:p,profile:config,policy:issuePolicy});}
function accepted(overrides={}) {
  return progress({original:{contentHash:'original',verdict:verdict('original',{issues:[issue()]})},...overrides});
}
function repaired(candidateOverrides={}, overrides={}) {
  return accepted({completed:['prepare','draft','accept','repair'],repairAttemptsUsed:1,repairOutcome:'candidate',
    candidate:{contentHash:'candidate',...candidateOverrides},...overrides});
}
module.exports={assert,fs,path,call,domain,stages,profile,policy,unit,verdict,issue,progress,next,accepted,repaired};
