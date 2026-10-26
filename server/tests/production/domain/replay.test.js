const {test}=require('node:test');
const {assert,fs,path,call,profile,policy}=require('./fixtures.cjs');
const directory=path.join(__dirname,'fixtures');
for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.json'))){
  test(`replay ${name} produces the literal sequence and leaves its inputs unchanged`,()=>{
    const fixture=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
    const before=JSON.stringify(fixture);
    const input={...fixture,profile:profile(),policy};
    assert.deepEqual(call('replayDecisions',input),fixture.expected);
    assert.deepEqual(call('replayDecisions',input),fixture.expected);
    assert.equal(JSON.stringify(fixture),before);
  });
}
test('replay rejects a result for the wrong stage',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(directory,'direct-pass.json'),'utf8'));
  fixture.results=[{stage:'draft',contentHash:'other'}];
  assert.throws(()=>call('replayDecisions',{...fixture,profile:profile(),policy}),{name:'InvalidUnitTransitionError'});
});
