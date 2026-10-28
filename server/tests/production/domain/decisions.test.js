const {test}=require('node:test');
const {assert,call,profile,policy,unit,verdict,issue,progress,next,accepted,repaired}=require('./fixtures.cjs');

test('prepare precedes generation and an exhausted empty draft fails',()=>{
  assert.deepEqual(next({unit,completed:[],repairAttemptsUsed:0}),{kind:'run_stage',stage:'prepare'});
  assert.deepEqual(next({unit,completed:['prepare'],repairAttemptsUsed:0}),{kind:'run_stage',stage:'draft'});
  assert.deepEqual(next({unit,completed:['prepare','draft'],repairAttemptsUsed:0}),{kind:'fail',reason:'no_usable_content'});
});
test('passing original emits explicit selection before commit without mutating input',()=>{
  const p=progress(); const before=JSON.stringify(p); const action=next(p);
  assert.deepEqual(action,{kind:'select_final',selected:'original',contentHash:'original',reasonCode:'original_accepted'});
  assert.equal(JSON.stringify(p),before);
  const selected=call('applyUnitAction',p,action);
  assert.deepEqual(next(selected),{kind:'run_stage',stage:'commit'});
  assert.equal(p.selected,undefined);
});
test('repairable original enters one repair while detect-only and exhausted modes retain it',()=>{
  assert.deepEqual(next(accepted()),{kind:'run_stage',stage:'repair'});
  for(const config of [profile({repair:{maxAttempts:0,mode:'light_repair'}}),profile({repair:{maxAttempts:1,mode:'detect_only'}})]){
    assert.equal(next(accepted(),config).kind,'select_final');
  }
  assert.equal(next(accepted({repairAttemptsUsed:1})).kind,'select_final');
});
test('used repair allowance still verifies and selects the existing candidate',()=>{
  const p=repaired(); assert.deepEqual(next(p),{kind:'run_stage',stage:'verify'});
  const verified=call('applyStageResult',p,{stage:'verify',verdict:verdict('candidate',{factPreservation:'preserved'})});
  assert.deepEqual(next(verified),{kind:'run_stage',stage:'select'});
  const selection=call('selectCandidate',verified.original.verdict,verified.candidate.verdict);
  const selected=call('applyStageResult',verified,{stage:'select',selection});
  assert.equal(selected.selected,'candidate');
  assert.deepEqual(next(selected),{kind:'run_stage',stage:'commit'});
});
test('unavailable review creates review debt and never spends a repair',()=>{
  const p=progress({original:{contentHash:'original',verdict:verdict('original',{gateAvailable:false})}});
  const selected=call('applyUnitAction',p,next(p));
  const action=next(selected); assert.equal(action.kind,'record_debt');
  assert.equal(action.debts[0].code,'review_unavailable');
  assert.equal(selected.repairAttemptsUsed,0);
});
test('local window replan records debt and global book replan stops',()=>{
  const p=progress({original:{contentHash:'original',verdict:verdict('original',{replan:'local_window'})}});
  assert.equal(next(p).kind,'select_final');
  const selected=call('applyUnitAction',p,next(p));
  assert.equal(next(selected).kind,'record_debt');
  assert.deepEqual(next(progress({original:{contentHash:'original',verdict:verdict('original',{replan:'global_book'})}})),
    {kind:'stop_for_replan',scope:'global_book'});
});
test('completion policy commits usable prose with debt while manual policy pauses',()=>{
  const p=accepted({repairAttemptsUsed:1}); const selected=call('applyUnitAction',p,next(p));
  const debt=next(selected); assert.equal(debt.kind,'record_debt');
  const saved=call('applyUnitAction',selected,debt);
  assert.deepEqual(next(saved),{kind:'run_stage',stage:'commit'});
  // Quality-first pauses after preserving prose at the chapter boundary.
  assert.equal(next(p,profile(),{blockingAction:'pause_for_manual'}).kind,'select_final');
  const committed=call('applyStageResult',saved,{stage:'commit',contentHash:'original'});
  const pause=next(committed,profile(),{blockingAction:'pause_for_manual'});
  assert.equal(pause.kind,'record_quality_pause');
  assert.equal(next(call('applyUnitAction',committed,pause),profile(),{blockingAction:'pause_for_manual'}).kind,'pause_for_manual');
});
test('user edits block both repairs and commits',()=>{
  for(const p of [accepted({userEditedSinceStart:true}),progress({selected:'original',selectedContentHash:'original',userEditedSinceStart:true})]){
    assert.equal(next(p).kind,'pause_for_manual');
  }
});
test('failed or unchanged repair preserves allowance and skips paid verification',()=>{
  for(const result of [{stage:'repair',outcome:'failed',failureCode:'patch_anchor_invalid'},
    {stage:'repair',outcome:'unchanged'}]){
    const p=call('applyStageResult',accepted(),result);
    assert.equal(p.repairAttemptsUsed,1); assert.equal(p.candidate,undefined);
    assert.equal(next(p).kind,'select_final');
  }
});
test('persisted selection survives recovery and cannot change after allowance is exhausted',()=>{
  const p=repaired({verdict:verdict('candidate',{factPreservation:'preserved'})},{completed:['prepare','draft','accept','repair','verify','select'],selected:'candidate',selectedContentHash:'candidate',selectionReasonCode:'candidate_improved'});
  assert.deepEqual(next(JSON.parse(JSON.stringify(p))),{kind:'run_stage',stage:'commit'});
});
test('pending reconciliation resumes instead of falsely completing',()=>{
  const selected=call('applyUnitAction',progress(),next(progress()));
  const committed=call('applyStageResult',selected,{stage:'commit',contentHash:'original'});
  assert.deepEqual(next(committed),{kind:'run_stage',stage:'reconcile'});
  const pending=call('applyStageResult',committed,{stage:'reconcile',status:'pending'});
  assert.deepEqual(next(pending),{kind:'run_stage',stage:'reconcile'});
  for(const status of ['completed','degraded'])assert.deepEqual(next(call('applyStageResult',pending,{stage:'reconcile',status})),{kind:'done'});
  assert.deepEqual(next(call('applyStageResult',committed,{stage:'reconcile',status:'failed'})),{kind:'fail',reason:'data_integrity'});
  assert.deepEqual(next(committed,profile({stages:['prepare','draft','accept','commit']})),{kind:'done'});
});
test('missing or stale assessment identity fails closed',()=>{
  assert.deepEqual(next(progress({original:{contentHash:'original'}})),{kind:'fail',reason:'data_integrity'});
  assert.deepEqual(next(progress({original:{contentHash:'original',verdict:verdict('old')}})),{kind:'fail',reason:'data_integrity'});
});
test('identical snapshots yield identical decisions',()=>{
  const p=accepted();assert.deepEqual(next(p),next(JSON.parse(JSON.stringify(p))));
});
