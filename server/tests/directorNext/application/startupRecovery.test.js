const test=require('node:test');const assert=require('node:assert/strict');
const {RecoveryTaskService}=require('../../../dist/services/task/RecoveryTaskService');
test('entry-controlled startup freezes novel history without changing other recovery services',async()=>{
 const calls=[];
 const deps=Object.fromEntries(['BookAnalyses','ImageTasks','AutoDirectorTasks','PipelineJobs','StyleTasks'].map(name=>['markPending'+name+'ForManualRecovery',async()=>{calls.push(name);} ]));
 const switched=new RecoveryTaskService({}, {}, {}, {}, deps);
 await switched.initializePendingRecoveries({includeNovelProduction:false});
 assert.deepEqual(calls,['BookAnalyses','ImageTasks','StyleTasks']);
 calls.length=0;
 await new RecoveryTaskService({}, {}, {}, {}, deps).initializePendingRecoveries();
 assert.deepEqual(calls,['BookAnalyses','ImageTasks','AutoDirectorTasks','PipelineJobs','StyleTasks']);
});
