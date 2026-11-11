const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmptyOutlineDocument } = require("@ai-novel/shared/types/outline");
const { mapOutlineBook, validateOpenBookDocument } = require("../dist/modules/planning/outline/openBook/domain/mapping");
function fixture() {
 const d = createEmptyOutlineDocument("雾港"); d.story.premise = "收到未来来信";
 for (let i=1;i<=3;i++) d.volumes.push({nodeId:`v${i}`,order:i-1,title:`卷${i}`,summary:`方向${i}`,planningDepth:"rough",chapterNodeIds:[]});
 for (const [id,v,o] of [["a",1,0],["b",1,1],["c",3,0]]) {d.chapters.push({nodeId:id,volumeNodeId:`v${v}`,order:o,title:id,summary:"保留原纲",planningDepth:"rough",characterNodeIds:[],payoffNodeIds:[]}); d.volumes[v-1].chapterNodeIds.push(id);}
 d.characters.push({nodeId:"p",name:"林",appearanceNodeIds:["v1"]},{nodeId:"q",name:"林",appearanceNodeIds:[]});
 d.facts.push({nodeId:"f",title:"规则",content:"不能逆转时间",scope:{type:"story"},immutable:true,relatedNodeIds:[]});
 return d;
}
const input={revisionId:"r",expectedProjectVersion:1,bookSettings:{title:"雾港",estimatedChapterCount:80,defaultChapterLength:3000},volumeQuotas:{v1:20,v2:30,v3:30},allowOptimize:[]};
test("outline opening assigns sparse global slots 1/2/51 without placeholder chapters",()=>{const r=mapOutlineBook(fixture(),input,"binding");assert.deepEqual(r.mapping.chapters.map(c=>c.chapterOrder),[1,2,51]);assert.equal(r.mapping.chapters.length,3);assert.notEqual(r.mapping.chapters[0].planId,r.mapping.chapters[0].chapterId);assert.notEqual(r.mapping.characters[0].characterId,r.mapping.characters[1].characterId);assert.equal(r.warnings.length,1);assert.deepEqual(r.mapping,mapOutlineBook(fixture(),input,"binding").mapping);});
test("minimal story maps without volumes or invented assets",()=>{const d=createEmptyOutlineDocument();d.story.synopsis="开始";const r=mapOutlineBook(d,{...input,volumeQuotas:{}},"b");assert.equal(r.mapping.volumes.length,0);assert.equal(r.mapping.chapters.length,0);});
test("preservation distinguishes immutable, empty and existing fields",()=>{const r=mapOutlineBook(fixture(),input,"b");assert.equal(r.policy.rules.find(x=>x.nodeId==="f"&&x.field==="content").mode,"hard_constraint");assert.equal(r.policy.rules.find(x=>x.nodeId==="a"&&x.field==="summary").mode,"preserve");assert.equal(r.policy.rules.find(x=>x.nodeId==="a"&&x.field==="characterNodeIds").mode,"fill_missing");assert.throws(()=>mapOutlineBook(fixture(),{...input,allowOptimize:[{nodeId:"f",field:"content"}]},"b"),/不能放开/);});
test("wrong typed references, duplicate order, contradictory hierarchy and scope are rejected",()=>{for(const change of [d=>d.chapters[0].characterNodeIds.push("v1"),d=>d.volumes[1].order=0,d=>d.volumes[0].chapterNodeIds.reverse(),d=>d.facts[0].scope={type:"chapter",nodeId:"v1"},d=>d.volumes[0].chapterNodeIds.pop()]){const d=fixture();change(d);assert.throws(()=>validateOpenBookDocument(d));}});
test("quotas reject overflow and fully detailed allocation must be explicit",()=>{assert.throws(()=>mapOutlineBook(fixture(),{...input,volumeQuotas:{v1:1,v2:30,v3:49}},"b"),/少于/);assert.throws(()=>mapOutlineBook(fixture(),{...input,bookSettings:{...input.bookSettings,estimatedChapterCount:2}},"b"),/不足/);});
test("source hash independent of request choices and canonical key order",()=>{const d=fixture();const a=mapOutlineBook(d,input,"b");const b=mapOutlineBook(d,{...input,bookSettings:{...input.bookSettings,title:"另名"}},"b");assert.equal(a.sourceDocumentHash,b.sourceDocumentHash);assert.notEqual(a.requestHash,b.requestHash);});
