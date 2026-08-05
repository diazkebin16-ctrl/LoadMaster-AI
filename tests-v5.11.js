const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout}=sandbox.__LM;
const trailer={width:96,length:168};
let id=0;const mk=(w,l,x,y,name)=>({id:`s${++id}`,name,w,l,x,y,qty:20,type:'4-way',canRotate:true,locked:false});
const placed=[];
// Dos columnas de 34 ocupan el lado izquierdo; la columna de 28 tiene huecos verticales.
for(let r=0;r<4;r++){
  placed.push(mk(34,28,0,r*28,'34'),mk(34,28,34,r*28,'34'));
  placed.push(mk(28,28,68,r*40,'28'));
}
const pending=[mk(28,28,0,0,'28 pendiente'),mk(28,28,0,0,'28 pendiente')];
const all=[...placed,...pending];
const engine=new LoadEngine(trailer,{timeLimitMs:3000});
const rescued=engine.compactPendingRescue(placed,pending,all);
if(!rescued)throw new Error('La fase de compactación no produjo resultado');
if(rescued.unplaced.length!==0)throw new Error(`La compactación dejó ${rescued.unplaced.length} pilas fuera`);
if(rescued.stacks.length!==all.length)throw new Error('Se perdió alguna pila durante la compactación');
const check=validateLayout(rescued.stacks,trailer);
if(!check.ok)throw new Error('La compactación produjo colisiones o piezas fuera del tráiler');
const right=rescued.stacks.filter(s=>s.x>=68-1e-7).sort((a,b)=>a.y-b.y);
for(let i=1;i<right.length;i++)if(Math.abs(right[i].y-(right[i-1].y+right[i-1].l))>1e-7)throw new Error('Quedaron huecos verticales en la columna compactada');
console.log('PASS v5.11: compactación por gravedad, revisión de huecos e inserción de dos pendientes.');
