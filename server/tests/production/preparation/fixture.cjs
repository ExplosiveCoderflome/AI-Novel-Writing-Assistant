const assert=require('node:assert/strict');
const {setup}=require('../persistence/sqliteFixture.cjs');
async function fixture(t){
 const kernel=require('../../../dist/modules/production');
 assert.equal(typeof kernel.PrismaPreparationCheckpointStore,'function');
 const f=await setup(t),before=f.context.run,progress={...before.progress};
 for(const key of ['selected','selectedContentHash','committedContentHash'])delete progress[key];
 const store=new kernel.PrismaUnitProgressStore(f.db,{assertOwnership:f.assertOwnership});
 const run=await store.compareAndSwap(before,{progress,artifacts:before.artifacts,activeStage:'prepare',activeRequestKey:'prepare-request'});
 const checkpoints=new kernel.PrismaPreparationCheckpointStore(f.db,f.assertOwnership);
 return{...f,run,checkpoints,store,identity:step=>({...f.identity(step),unitRequestKey:'prepare-request',step:`prepare:${step}`})};
}
module.exports={fixture};
