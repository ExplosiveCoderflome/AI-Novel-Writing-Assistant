const test=require('node:test'),assert=require('node:assert/strict');
const {PayoffLedgerSyncService}=require('../dist/services/payoff/PayoffLedgerSyncService');
test('read-only preparation never auto-syncs an empty payoff ledger and concurrent legacy reads retain their behavior',async()=>{
 const {withPayoffLedgerReadScope}=require('../dist/services/payoff/readScope');
 const service=new PayoffLedgerSyncService();let syncs=0;
 service.loadLedgerRows=async()=>[];service.syncLedger=async()=>{syncs++;return {legacy:true};};
 const [readOnly,legacy]=await Promise.all([
  withPayoffLedgerReadScope(()=>service.getPayoffLedger('book')),
  service.getPayoffLedger('book'),
 ]);
 assert.equal(syncs,1);assert.equal(legacy.legacy,true);
 assert.deepEqual(readOnly,await service.getPayoffLedger('book',{syncIfMissing:false}));
 await withPayoffLedgerReadScope(()=>service.getPayoffLedger('book',{syncIfMissing:true}));assert.equal(syncs,1);
 await service.getPayoffLedger('book');assert.equal(syncs,2);
});
test('read scope preserves existing ledger results and propagates read failures',async()=>{
 const {withPayoffLedgerReadScope}=require('../dist/services/payoff/readScope');
 const service=new PayoffLedgerSyncService();
 service.loadLedgerRows=async()=>[{id:'payoff',ledgerKey:'one',novelId:'book',title:'旧伏笔',status:'open',createdAt:new Date(0),updatedAt:new Date(0)}];
 const expected=await service.getPayoffLedger('book',{syncIfMissing:false});
 assert.deepEqual(await withPayoffLedgerReadScope(()=>service.getPayoffLedger('book')),expected);
 service.loadLedgerRows=async()=>{throw Error('read failed');};
 await assert.rejects(withPayoffLedgerReadScope(()=>service.getPayoffLedger('book')),/read failed/);
});
