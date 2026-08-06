const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
let src=fs.readFileSync('app.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.27'),'Versión visual incorrecta');
for(const id of ['catalogManageSelect','editCatalogSelected','duplicateCatalogSelected','deleteCatalogSelected'])ok(html.includes(`id="${id}"`),`Falta ${id}`);
ok(src.includes('automaticCompact(input,level="deep")'),'Falta compactación automática por niveles');
ok(src.includes('lateralCompact(input,direction="left")'),'Falta compactación lateral');
ok(src.includes('this.automaticCompact(candidate.stacks,"deep")'),'Los candidatos no se compactan antes de evaluarse');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null,createElement:()=>({})},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout}=sandbox.__LM;
const trailer={width:96,length:180};
let id=0;const mk=(w,l,x,y)=>({id:`s${++id}`,name:'p',w,l,x,y,qty:1,type:'4-way',canRotate:true,locked:false});
const placed=[];
for(let r=0;r<4;r++){placed.push(mk(34,28,0,r*30),mk(34,28,36,r*30),mk(28,28,68,r*40));}
const pending=[mk(28,28,0,0),mk(28,28,0,0)];
const all=[...placed,...pending];
const engine=new LoadEngine(trailer,{timeLimitMs:5000});
const normalized=engine.normalizeCandidate({name:'prueba',stacks:placed,unplaced:pending},all);
ok(normalized,'No se normalizó el candidato');
ok(normalized.unplaced.length===0,`Quedaron ${normalized.unplaced.length} pendientes`);
ok(normalized.stacks.length===all.length,'Se perdieron pilas');
ok(validateLayout(normalized.stacks,trailer).ok,'La compactación produjo un plano inválido');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
ok(ids.length===new Set(ids).size,'Hay IDs HTML duplicados');
console.log('PASS v5.27: compactación automática profunda y gestión editable del catálogo.');
