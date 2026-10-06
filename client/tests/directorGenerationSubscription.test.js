import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeGenerationSnapshots } from '../src/pages/directorNext/generation/subscription.ts';

const frame={novelId:'n',chapterId:'c',chapterOrder:1,chapterTitle:'章',executionId:'run',revision:1,state:'writing',content:'初稿',updatedAt:123};
test('closing the follow subscription rejects queued messages and reconnection never appends duplicate prose',()=>{
  let source;
  const values=[],connections=[];
  const close=subscribeGenerationSnapshots('/stream','n',{onSnapshot:frame=>values.push(frame),onConnection:value=>connections.push(value)},url=>{
    assert.equal(url,'/stream');source={closeCalls:0,close(){this.closeCalls++;}};return source;
  });
  source.onopen();
  source.onmessage({data:JSON.stringify(frame)});
  source.onerror();source.onopen();
  source.onmessage({data:JSON.stringify(frame)});
  source.onmessage({data:JSON.stringify({...frame,revision:2,content:'初稿继续'})});
  source.onmessage({data:JSON.stringify({...frame,revision:1,content:'过期帧'})});
  source.onmessage({data:'{invalid'});
  source.onmessage({data:JSON.stringify({...frame,novelId:'other',revision:3})});
  assert.deepEqual(values.map(frame=>frame.content),['初稿','初稿继续']);
  assert.deepEqual(connections,[true,false,true]);
  const queued=source.onmessage;
  close();queued({data:JSON.stringify({...frame,revision:3,content:'关闭后消息'})});
  assert.equal(values.length,2);
  assert.equal(source.closeCalls,1);
});
