const test=require('node:test');
const assert=require('node:assert/strict');
const {prisma}=require('../../../dist/db/prisma');
const {stubDatabaseMethod}=require('../../legacyDirector/databasePorts');
const {appendCharacterCastOptionsDraft,persistCharacterCastOptionsDraft}=require('../../../dist/services/novel/characterPrep/characterCastGeneration');
const parsed={options:[{title:'阵容',summary:'介绍',members:[],relations:[]}]};

function stubCandidateWrites(t) {
 const calls=[];
 const tx={characterCastOption:{deleteMany:async()=>calls.push('delete'),create:async input=>{calls.push(['create',input]);return {id:'option-id'};}}};
 stubDatabaseMethod(t,prisma,'$transaction',async fn=>fn(tx));
 return calls;
}

test('append preserves previous candidates and returns saved identities',async(t)=>{
 const calls=stubCandidateWrites(t);
 assert.deepEqual(await appendCharacterCastOptionsDraft('novel','故事',parsed),['option-id']);
 assert.equal(calls.some(row=>row==='delete'),false);assert.equal(calls[0][1].data.novelId,'novel');
});
test('legacy replacement preserves its void result and replacement behavior',async(t)=>{
 const calls=stubCandidateWrites(t);
 assert.equal(await persistCharacterCastOptionsDraft('novel','故事',parsed),undefined);
 assert.equal(calls[0],'delete');assert.equal(calls[1][0],'create');
});

test('empty-cast application refuses existing characters before writes',async(t)=>{
 const quality=require('../../../dist/services/novel/characterPrep/characterCastQuality');
 t.mock.method(quality,'assessCharacterCastBatch',()=>({autoApplicableOptionIndex:0,blockingReasons:[]}));
 stubDatabaseMethod(t,prisma.characterCastOption,'findFirst',async()=>({id:'option',novelId:'novel',members:[],relations:[],createdAt:new Date(),updatedAt:new Date()}));
 stubDatabaseMethod(t,prisma.character,'findMany',async()=>[{id:'existing',name:'已有角色'}]);
 const {CharacterPreparationService}=require('../../../dist/services/novel/characterPrep/CharacterPreparationService');
 const service=new CharacterPreparationService();
 await assert.rejects(()=>service.applyCharacterCastOption('novel','option',{requireEmptyCast:true,postApplyMode:'deferred'}),/已有角色/);
});
