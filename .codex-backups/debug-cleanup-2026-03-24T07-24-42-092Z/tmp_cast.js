const fs=require('fs'); 
const s=fs.readFileSync('server/src/services/novel/characterPrep/CharacterPreparationService.ts','utf8').split('\n'); 
for(let i=220;i<=390;i++)console.log(i+':'+s[i-1]); 
