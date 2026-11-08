// Genera lib/desc-es.js (descripciones en español) a partir de los CSV de PokeAPI (idioma 7 = español).
// Uso: node tools/descs.js <carpeta con los csv>
const fs=require('fs');
const dir=process.argv[2];
const rd=f=>fs.readFileSync(dir+'/'+f+'.csv','utf8').trim().split('\n').slice(1);
const parse=l=>{const o=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){if(q&&l[i+1]==='"'){c+='"';i++}else q=!q}else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o};
const toID=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
// los textos con saltos de línea ocupan varias líneas en el csv: se unen antes de separar
function rows(f){const out=[];let cur='';for(const l of rd(f)){cur=cur?cur+' '+l:l;if((cur.match(/"/g)||[]).length%2===0){out.push(parse(cur));cur=''}}return out}
function build(entity,flav,idcol){
  const idMap={};rows(entity).forEach(r=>idMap[r[0]]=toID(r[1]));
  const best={};
  rows(flav).forEach(r=>{ // id, version_group, language, texto
    if(r[idcol+1]!=='7'&&r[2]!=='7')return;
    const lang=r[2],vg=+r[1],txt=r[3];if(lang!=='7'||!txt)return;
    const k=idMap[r[0]];if(!k)return;
    if(!best[k]||vg>=best[k][0])best[k]=[vg,txt.replace(/[\n­\f]+/g,' ').replace(/\s+/g,' ').trim()]});
  const o={};for(const k in best)o[k]=best[k][1];return o}
const D={a:build('abilities','ability_flavor_text',0),m:build('moves','move_flavor_text',0),i:build('items','item_flavor_text',0)};
for(const k in D)console.log(k,Object.keys(D[k]).length);
fs.writeFileSync(__dirname+'/../lib/desc-es.js','window.DESC_ES='+JSON.stringify(D)+';\n');
console.log(fs.statSync(__dirname+'/../lib/desc-es.js').size);
