const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const calls=[];
const tx={characterCastOption:{deleteMany:async()=>calls.push('delete'),create:async input=>{calls.push(['create',input]);return {id:'option-id'};}}};
const prismaEntry=path.resolve(__dirname,'../../../dist/db/prisma.js');
const stub=new Module(prismaEntry);stub.loaded=true;stub.exports={prisma:{$transaction:async fn=>fn(tx)}};require.cache[prismaEntry]=stub;
const {appendCharacterCastOptionsDraft,persistCharacterCastOptionsDraft}=require('../../../dist/services/novel/characterPrep/characterCastGeneration');
const parsed={options:[{title:'阵容',summary:'介绍',members:[],relations:[]}]};
test('append preserves previous candidates and returns saved identities',async()=>{
 calls.length=0;assert.deepEqual(await appendCharacterCastOptionsDraft('novel','故事',parsed),['option-id']);
 assert.equal(calls.some(row=>row==='delete'),false);assert.equal(calls[0][1].data.novelId,'novel');
});
test('legacy replacement preserves its void result and replacement behavior',async()=>{
 calls.length=0;assert.equal(await persistCharacterCastOptionsDraft('novel','故事',parsed),undefined);
 assert.equal(calls[0],'delete');assert.equal(calls[1][0],'create');
});

test('empty-cast application refuses existing characters before writes',async()=>{
 const quality=require('../../../dist/services/novel/characterPrep/characterCastQuality');
 quality.assessCharacterCastBatch=()=>({autoApplicableOptionIndex:0,blockingReasons:[]});
 const prisma=stub.exports.prisma;
 prisma.characterCastOption={findFirst:async()=>({id:'option',novelId:'novel',members:[],relations:[],createdAt:new Date(),updatedAt:new Date()})};
 prisma.character={findMany:async()=>[{id:'existing',name:'已有角色'}]};
 const {CharacterPreparationService}=require('../../../dist/services/novel/characterPrep/CharacterPreparationService');
 const service=new CharacterPreparationService();
 await assert.rejects(()=>service.applyCharacterCastOption('novel','option',{requireEmptyCast:true,postApplyMode:'deferred'}),/已有角色/);
});
