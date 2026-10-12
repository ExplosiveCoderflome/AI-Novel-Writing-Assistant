const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {once}=require('node:events');
const {mountDirectorNext}=require('../dist/modules/director/http');
const {ChapterGenerationFeed}=require('../dist/services/novel/production/observation');

test('read-only SSE replays accumulated prose and disconnecting releases its subscription', {timeout:5000}, async()=>{
  const feed=new ChapterGenerationFeed();
  const identity=feed.begin({novelId:'n',chapterId:'c',chapterOrder:1,chapterTitle:'第一章'});
  feed.update(identity,'writing','已有草稿');
  let connections=0, commands=0;
  let onDisconnected;
  const disconnected=new Promise(resolve=>{onDisconnected=resolve;});
  const app=express();
  mountDirectorNext(app,{commandService:{execute:async()=>{commands++;}},projectionService:{},runRepository:{},eventLog:{},
    observeGeneration:(id,listener)=>{connections++;const stop=feed.subscribe(id,listener);return ()=>{connections--;stop();onDisconnected();};}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const controller=new AbortController();
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/director-next/novels/n/generation-stream`,{signal:controller.signal});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/event-stream/);
    const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
    async function nextFrame(){
      while(!buffer.includes('\n\n')){const {value,done}=await reader.read();assert.equal(done,false);buffer+=decoder.decode(value,{stream:true});}
      const end=buffer.indexOf('\n\n');const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
      return JSON.parse(frame.slice('data: '.length));
    }
    assert.equal((await nextFrame()).content,'已有草稿');
    feed.update(identity,'writing','已有草稿继续');
    assert.equal((await nextFrame()).content,'已有草稿继续');
    controller.abort();
    await disconnected;
    // Generation is independent of the connection and can complete after it closes.
    feed.update(identity,'saved','保存版');
    assert.equal(feed.read('n').state,'saved');
    assert.equal(commands,0);
  }finally{
    controller.abort();const closed=once(server,'close');server.close();server.closeAllConnections();await closed;
  }
  assert.equal(connections,0);
});
