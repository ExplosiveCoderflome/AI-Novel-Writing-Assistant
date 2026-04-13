const fs=require('fs'); 
const path=require('path'); 
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(x=,x.name)):path.join(d,x.name));} 
const files=walk('server/src').filter(p=/\.(ts|tsx|js)$/.test(p)); 
for(const p of files){const s=fs.readFileSync(p,'utf8').split(/\r?\n/);for(let i=0;i<s.length;i++){if(s[i].includes('prisma.character.create')||s[i].includes('character.create(')||s[i].includes('tx.character.create(')||s[i].includes('character.createMany('))console.log(p+':'+(i+1)+':'+s[i]);}} 
