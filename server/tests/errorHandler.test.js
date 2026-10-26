const test=require('node:test'),assert=require('node:assert/strict');
const {errorHandler,AppError}=require('../dist/middleware/errorHandler');
function handle(error){let body,status,header;const original=console.error;console.error=()=>{};
 try{errorHandler(error,{method:'GET',originalUrl:'/read'}, {locals:{},setHeader:(_key,value)=>{header=value;},status:code=>{status=code;return {json:value=>{body=value;}};}},()=>{});}
 finally{console.error=original;}return {body,status,header};}
test('unknown errors expose a generic message and correlation id, never SQL or private paths',()=>{
 const result=handle(Error('SELECT secret FROM C:/private.db api-key=123'));
 assert.equal(result.status,500);assert.equal(result.body.error,'服务器错误，请稍后重试。');
 assert.match(result.body.requestId,/^[0-9a-f-]{36}$/);assert.equal(result.header,result.body.requestId);
 for(const part of ['SELECT','private.db','api-key'])assert.ok(!JSON.stringify(result.body).includes(part));
});
test('explicit application errors retain their public message and machine-readable code',()=>{
 const error=new AppError('请补齐模型上下文配置。',503);error.code='production_model_capability_missing';
 const result=handle(error);assert.equal(result.status,503);assert.equal(result.body.error,error.message);assert.equal(result.body.code,error.code);
});
