const fs=require('fs'); 
const s=fs.readFileSync('client/src/pages/novels/hooks/useNovelCharacterMutations.ts','utf8').split('\n'); 
for(let i=168;i<=260;i++)console.log(i+':'+s[i-1]); 
