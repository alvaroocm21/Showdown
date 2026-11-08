// Genera lib/item-ids.js: id de Showdown -> nombre del sprite en PokeAPI (p. ej. lifeorb -> life-orb).
// Uso: node tools/itemids.js <carpeta con items.csv>
const fs=require('fs');
const toID=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const rows=fs.readFileSync(process.argv[2]+'/items.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const m={};rows.forEach(r=>{if(r[1]&&!/^(data-card|tm\d|hm\d)/.test(r[1]))m[toID(r[1])]=r[1]});
fs.writeFileSync(__dirname+'/../lib/item-ids.js','window.ITEM_IDS='+JSON.stringify(m)+';\n');
console.log(Object.keys(m).length);
