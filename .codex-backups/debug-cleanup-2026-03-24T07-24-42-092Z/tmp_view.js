const fs=require('fs'); 
const files=['client/src/pages/novels/NovelEdit.tsx','client/src/pages/novels/components/NovelEditView.tsx']; 
for(const p of files){const s=fs.readFileSync(p,'utf8').split(/\r?\n/);console.log('FILE '+p);for(const k of ['getNovelCharacters','useQuery','characters','selectedCharacterId','NovelCharacterPanel']){for(let i=0;i<s.length;i++){if(s[i].includes(k)){console.log('---'+k+' @ '+(i+1));for(let j=Math.max(0,i-3);j<Math.min(s.length,i+14);j++)console.log((j+1)+':'+s[j]);break;}}}} 
