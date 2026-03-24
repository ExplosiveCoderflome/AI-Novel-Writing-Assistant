const fs=require('fs'); 
const s=fs.readFileSync('client/src/pages/novels/NovelEdit.tsx','utf8').split('\n'); 
for(let i=90;i<=140;i++)console.log(i+':'+s[i-1]); 
