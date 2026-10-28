const {test}=require('node:test');
const {assert,call,profile,unit,verdict,progress,next,accepted,repaired}=require('./fixtures.cjs');
test('profiles reject unsafe repair pipelines and invalid repair budgets',()=>{
  for(const config of [profile({repair:{maxAttempts:2,mode:'light_repair'}}),profile({stages:['prepare','draft','repair','verify','select','commit']}),
    profile({stages:['prepare','draft','accept','repair','commit']}),profile({stages:['draft','prepare','accept','commit']})]){
    assert.throws(()=>call('defineProfile',config),{name:'InvalidProductionProfileError'});
  }
  assert.equal(call('defineProfile',profile()).id,'long_chapter@1');
});
test('profile ID checking uses explicit inputs and has no global registry',()=>{
  assert.deepEqual(call('defineProfile',profile()),call('defineProfile',profile()));
  assert.throws(()=>call('defineProfile',profile(),['long_chapter@1']),{name:'InvalidProductionProfileError'});
});
test('stages cannot bypass verification or commit before final selection',()=>{
  assert.throws(()=>call('applyStageResult',progress(),{stage:'commit',contentHash:'original'}),{name:'InvalidUnitTransitionError'});
  assert.throws(()=>call('applyStageResult',progress(),{stage:'verify',verdict:verdict('candidate')}),{name:'InvalidUnitTransitionError'});
  assert.throws(()=>call('applyStageResult',{unit,completed:['prepare'],repairAttemptsUsed:0},{stage:'repair',outcome:'failed'}),{name:'InvalidUnitTransitionError'});
  assert.throws(()=>call('applyUnitAction',repaired(),{kind:'select_final',selected:'original',contentHash:'original',reasonCode:'bypass'}),{name:'InvalidUnitTransitionError'});
});
test('selection is idempotent and conflicting or stale decisions are rejected',()=>{
  const p=progress(),a=next(p),selected=call('applyUnitAction',p,a);
  assert.deepEqual(call('applyUnitAction',selected,a),selected);
  assert.throws(()=>call('applyUnitAction',selected,{...a,contentHash:'other'}),{name:'InvalidUnitTransitionError'});
  assert.throws(()=>call('applyStageResult',selected,{stage:'commit',contentHash:'other'}),{name:'InvalidUnitTransitionError'});
  assert.throws(()=>call('applyStageResult',progress(),{stage:'accept',verdict:verdict('other')}),{name:'InvalidUnitTransitionError'});
});
test('stage replay neither consumes repair twice nor overwrites a saved verdict',()=>{
  const a={stage:'repair',outcome:'failed',failureCode:'patch_invalid'};
  const p=call('applyStageResult',accepted(),a);
  assert.deepEqual(call('applyStageResult',p,a),p);
  assert.throws(()=>call('applyStageResult',p,{stage:'repair',outcome:'candidate',contentHash:'candidate'}),{name:'InvalidUnitTransitionError'});
  const selected=call('applyUnitAction',progress(),next(progress()));
  const committed=call('applyStageResult',selected,{stage:'commit',contentHash:'original'});
  assert.throws(()=>call('applyStageResult',committed,{stage:'repair',outcome:'failed'}),{name:'InvalidUnitTransitionError'});
});
test('debt persistence is idempotent and does not alter final selection',()=>{
  const p=accepted({repairAttemptsUsed:1});const s=call('applyUnitAction',p,next(p));const a=next(s);
  const saved=call('applyUnitAction',s,a);
  assert.deepEqual(call('applyUnitAction',saved,a),saved);
  assert.equal(saved.selectedContentHash,'original');
});
test('stage result cannot forge adoption of an unsafe candidate',()=>{
  const p=repaired({verdict:verdict('candidate',{factPreservation:'unknown'})},
    {completed:['prepare','draft','accept','repair','verify']});
  assert.throws(()=>call('applyStageResult',p,{stage:'select',selection:{selected:'candidate',contentHash:'candidate',reasonCode:'candidate_improved'}}),
    {name:'InvalidUnitTransitionError'});
});
