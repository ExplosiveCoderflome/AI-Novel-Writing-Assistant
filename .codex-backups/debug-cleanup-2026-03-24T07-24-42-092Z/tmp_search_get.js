const fs=require('fs'); 
const s=fs.readFileSync('server/src/services/novel/NovelCoreService.ts','utf8').split('\n'); 
for(let i=1;i<=260;i++){if(s[i-1].includes('getNovelById')||s[i-1].includes('include:')||s[i-1].includes('characters'))console.log(i+':'+s[i-1]);} 
