// Genera lib/names-es.json a partir de los CSV de PokeAPI (idioma 7 = español)
const fs=require('fs');const {Dex}=require('@pkmn/sim');
const dir=process.argv[2];
const rd=f=>fs.readFileSync(dir+'/'+f+'.csv','utf8').trim().split('\n').slice(1).map(l=>{const o=[];let c='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o});
const toID=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function build(entity,names,col){
  const idMap={};rd(entity).forEach(r=>idMap[r[0]]=toID(r[1]));
  const out={};rd(names).forEach(r=>{if(r[1]==='7'&&r[2])out[idMap[r[0]]]=r[2]});return out}
const N={s:build('pokemon_species','pokemon_species_names'),m:build('moves','move_names'),a:build('abilities','ability_names'),i:build('items','item_names')};
// cobertura
const cov=(list,map,key)=>{const miss=list.filter(x=>!map[toID(x[key||'name'])]);return [list.length-miss.length,list.length,miss.slice(0,8).map(x=>x.name)]};
console.log('species(base)',cov(Dex.species.all().filter(s=>!s.forme),N.s));
console.log('moves',cov(Dex.moves.all().filter(m=>!m.isZ&&!m.isMax),N.m));
console.log('abilities',cov(Dex.abilities.all(),N.a));
console.log('items',cov(Dex.items.all(),N.i));
fs.writeFileSync('../lib/names-es.json',JSON.stringify(N));
console.log(fs.statSync('../lib/names-es.json').size);
