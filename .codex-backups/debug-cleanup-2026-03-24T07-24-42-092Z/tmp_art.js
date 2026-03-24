const fs=require('fs'); 
const s=fs.readFileSync('server/src/services/novel/runtime/ChapterArtifactSyncService.ts','utf8').split('\n'); 
for(let i=1;i<=155;i++)console.log(i+':'+s[i-1]); 
