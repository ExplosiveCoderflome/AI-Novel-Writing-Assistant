const fs=require('fs'); 
const p='server/src/services/novel/NovelCoreService.ts'; 
const s=fs.readFileSync(p,'utf8').split(/\r?\n/); 
const start=1110,end=1205;for(let i=start-1;i<end;i++)console.log((i+1)+':'+s[i]); 
