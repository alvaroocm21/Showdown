// Genera lib/sprite-ids.json: id de especie de Showdown -> id del render HOME en PokeAPI/sprites
const fs=require('fs');const {Dex}=require('@pkmn/sim');
const toID=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const rows=fs.readFileSync(process.argv[2],'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const byIdent={};rows.forEach(r=>byIdent[toID(r[1])]=+r[0]);
const out={};let miss=[],tot=0;
for(const s of Dex.species.all()){
  if(!s.exists||s.num<=0)continue;tot++;
  const id=byIdent[toID(s.name)];
  if(id&&id!==s.num)out[toID(s.name)]=id;
  else if(!id&&s.forme)miss.push(s.name);
}
fs.writeFileSync('../lib/sprite-ids.json',JSON.stringify(out));
console.log('formas mapeadas',Object.keys(out).length,'de',tot,'| sin render (usarán la base):',miss.length,miss.slice(0,25).join(', '));
