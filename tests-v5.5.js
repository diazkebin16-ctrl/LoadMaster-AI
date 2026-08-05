const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry,normalizeLibraryItem};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout,normalizeLibraryItem}=sandbox.__LM;
const mk=(id,w,l,x,y)=>({id,name:id,w,l,x,y,qty:1,type:'4-way',canRotate:true,locked:false});
const trailer={width:96,length:120};
const originals=[
  mk('a',48,40,0,0),mk('b',48,40,48,0),mk('c',48,40,0,40),
  mk('d',48,40,48,40),mk('e',48,40,0,80),mk('f',48,40,48,80)
];
// Simula una solución casi completa: faltan dos pilas y la zona final debe reconstruirse.
const placed=[originals[0],originals[1],originals[2],originals[3]];
const missing=[originals[4],originals[5]];
const engine=new LoadEngine(trailer,{timeLimitMs:2500,patterns:[],strategies:[]});
const rescued=engine.lastMileRescue(placed,missing,originals);
if(!rescued.length)throw new Error('La fase final no produjo candidatos');
rescued.sort((a,b)=>a.unplaced.length-b.unplaced.length);
if(rescued[0].unplaced.length!==0)throw new Error(`La fase final dejó ${rescued[0].unplaced.length} pilas fuera`);
if(!validateLayout(rescued[0].stacks,trailer).ok)throw new Error('El rescate final produjo una distribución inválida');
// Compatibilidad con medidas antiguas: nunca debe mostrar undefined si existen alias válidos.
const old=normalizeLibraryItem({id:'old',nombre:'Pallet antiguo',width:28,length:28,height:23,tipo:'4-way'});
if(old.w!==28||old.l!==28||old.maxHeight!==23)throw new Error('No normalizó una medida antigua');
const spanish=normalizeLibraryItem({id:'es',nombre:'Pallet ES',ancho:34,largo:42,altura:25});
if(spanish.w!==34||spanish.l!==42||spanish.maxHeight!==25)throw new Error('No normalizó aliases en español');
console.log('PASS v5.5: rescate dirigido de dos pilas, layout válido y autocompletado compatible.');
