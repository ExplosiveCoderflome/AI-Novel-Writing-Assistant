const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {registerNovelBaseRoutes}=require('../../../dist/modules/novel/setup/http/novelBaseRoutes');
const {novelCreateResourceRecommendationService}=require('../../../dist/services/novel/NovelCreateResourceRecommendationService');

test('creation responses carry the application entry without starting a director or altering saved experience',async()=>{
  const original=novelCreateResourceRecommendationService.resolveRequired;
  const previousEnabled=process.env.DIRECTOR_NEXT_ENABLED;
  novelCreateResourceRecommendationService.resolveRequired=async()=>({genreId:null,primaryStoryModeId:null,secondaryStoryModeId:null});
  const saved=[];
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{res.locals.directorNextEnabled=req.headers['x-test-entry']==='new';next();});
  const router=express.Router();
  registerNovelBaseRoutes({router,readDirectorIdentity:async id=>({novelId:id,version:saved.at(-1).directorVersion,epoch:0,sourceRoute:'/lab/director/book%20%2F1'}),novelService:{createNovel:async input=>{saved.push(input);return {...input,id:'book /1',creationExperience:'professional'};}}});
  app.use('/api/novels',router);
  const http=app.listen(0);await new Promise(resolve=>http.once('listening',resolve));
  try {
    for(const [entry,form,expected] of [['new','long_novel','/lab/director/book%20%2F1'],['old','long_novel',null]]) {
      process.env.DIRECTOR_NEXT_ENABLED=entry==='new'?'true':'false';
      const response=await fetch('http://127.0.0.1:'+http.address().port+'/api/novels',{method:'POST',headers:{'Content-Type':'application/json','x-test-entry':entry},body:JSON.stringify({title:'测试入口',description:'故事方向',narrativeForm:form})});
      assert.equal(response.status,201);
      const body=await response.json();
      assert.equal(body.data.workspaceSourceRoute,expected);
      assert.equal(body.data.creationExperience,'professional');
      assert.equal('workspaceSourceRoute' in saved.at(-1),false);
    }
  }finally{await new Promise(resolve=>http.close(resolve));novelCreateResourceRecommendationService.resolveRequired=original;if(previousEnabled===undefined)delete process.env.DIRECTOR_NEXT_ENABLED;else process.env.DIRECTOR_NEXT_ENABLED=previousEnabled;}
});
