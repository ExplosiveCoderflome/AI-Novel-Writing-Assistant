const fs=require('fs'); 
const p='client/src/api/novel.ts'; 
const s=fs.readFileSync(p,'utf8').split(/\r?\n/); 
for(const k of ['getNovelCharacters','createNovelCharacter','updateNovelCharacter','syncCharacterTimeline','syncAllCharacterTimeline','getCharacterTimeline']){for(let i=0;i<s.length;i++){if(s[i].includes(k)){console.log('---'+k+' @ '+(i+1));for(let j=Math.max(0,i-3);j<Math.min(s.length,i+16);j++)console.log((j+1)+':'+s[j]);break;}}} 
