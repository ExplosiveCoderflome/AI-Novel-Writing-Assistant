const {test}=require('node:test');
const {assert,call,verdict,issue}=require('./fixtures.cjs');
const original=()=>verdict('original',{issues:[issue()]});
const candidate=(overrides={})=>verdict('candidate',{factPreservation:'preserved',...overrides});
for(const [name,change] of [
 ['new severe risk',{issues:[issue('new','critical')]}],
 ['new obligation',{missingObligations:[{kind:'must_hit_now',repairability:'patchable_obligation_gap'}]}],
 ['violated facts',{factPreservation:'violated'}],
 ['unknown facts',{factPreservation:'unknown'}],
 ['missing fact verification',{factPreservation:undefined}],
 ['prose regression',{proseRegression:true}],
 ['unavailable review',{gateAvailable:false}],
 ['candidate requests global replan',{replan:'global_book'}],
])test(`retains original for ${name}`,()=>assert.equal(call('selectCandidate',original(),candidate(change)).selected,'original'));
test('fewer blockers without new risks selects candidate',()=>assert.equal(call('selectCandidate',original(),candidate()).selected,'candidate'));
test('authorized factual correction may be selected',()=>assert.equal(call('selectCandidate',original(),candidate({factPreservation:'authorized_correction'})).selected,'candidate'));
test('score-only change cannot replace prose',()=>{
  const a=verdict('original',{score:10});const b=candidate({score:100});
  assert.equal(call('selectCandidate',a,b).selected,'original');
});
test('stable code identity and severity escalation govern risk comparison',()=>{
  assert.equal(call('selectCandidate',original(),candidate({issues:[{...issue(),evidence:'different wording'}]})).selected,'original');
  assert.equal(call('selectCandidate',verdict('original',{issues:[issue('x','low')]}),candidate({issues:[issue('x','high')]})).selected,'original');
});
test('a new unmet obligation of the same kind cannot be hidden by a lower issue count', () => {
  const select = (a, b) => call('selectCandidate', a, b);
  const original = verdict('original', { issues: [{ code: 'old-risk', severity: 'high', patchable: true }],
    missingObligations: [{ kind: 'must_hit_now', summary: '交出钥匙', repairability: 'patchable_obligation_gap' }] });
  const candidate = verdict('candidate', { factPreservation: 'preserved',
    missingObligations: [{ kind: 'must_hit_now', summary: '找到证人', repairability: 'patchable_obligation_gap' }] });
  assert.equal(select(original, candidate).selected, 'original');
});
