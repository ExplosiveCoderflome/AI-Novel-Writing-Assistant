// Test-process safety: no external endpoint, credential or paid model may be contacted.
const net=require('node:net'); const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 let value=args[0]; if(Array.isArray(value))value=value[0];
 const host=typeof value==='object'?value.host:typeof args[1]==='string'?args[1]:undefined;
 if(host && !['127.0.0.1','localhost','::1'].includes(host))throw new Error('External network disabled for offline regression tests');
 return connect.apply(this,args);
};
const fetch=global.fetch;
global.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('External network disabled for offline regression tests');
 return fetch(input,init);
};
