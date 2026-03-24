const fs=require('fs'); 
const s=fs.readFileSync('client/src/pages/novels/NovelEdit.tsx','utf8').split('\n'); 
for(let i=150;i<=215;i++)console.log(i+':'+s[i-1]); 
