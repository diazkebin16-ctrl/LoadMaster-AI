const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry,runPortfolioSearch};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout}=sandbox.__LM;
const trailer={width:96,length:168};let id=0;
const mk=(w,l,x,y,name)=>({id:`t${++id}`,name,w,l,x,y,qty:20,type:'4-way',canRotate:true,locked:false});
const placed=[];
for(let r=0;r<4;r++){
  placed.push(mk(34,28,0,r*28,'34'),mk(34,28,34,r*28,'34'));
  placed.push(mk(28,28,68,r*40,'28'));
}
const pending=[mk(28,28,0,0,'28 pendiente'),mk(28,28,0,0,'28 pendiente')];
const all=[...placed,...pending];
const engine=new LoadEngine(trailer,{timeLimitMs:4000,seedOffset:512});
const normalized=engine.normalizeCandidate({name:'candidato con huecos',stacks:placed,unplaced:pending},all);
if(!normalized)throw new Error('No se normalizó el candidato');
if(normalized.unplaced.length)throw new Error(`La normalización dejó ${normalized.unplaced.length} pendientes`);
if(normalized.stacks.length!==all.length)throw new Error('La normalización perdió pilas');
if(!validateLayout(normalized.stacks,trailer).ok)throw new Error('La normalización creó una solución inválida');
// Comprueba que el resultado sea estable: normalizar de nuevo no debe perder carga.
const normalized2=engine.normalizeCandidate(normalized,all);
if(!normalized2||normalized2.unplaced.length||normalized2.stacks.length!==all.length)throw new Error('La segunda normalización no fue estable');
console.log('PASS v5.12: normalización obligatoria, reinserción de pendientes y estabilidad repetible.');
