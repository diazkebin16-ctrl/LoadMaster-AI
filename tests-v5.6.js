const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout}=sandbox.__LM;
const mk=(id,x,y)=>({id,name:id,w:32,l:30,x,y,qty:1,type:'4-way',canRotate:true,locked:false});
const trailer={width:96,length:120};
const originals=[];
let n=0;
for(let row=0;row<4;row++)for(let col=0;col<3;col++)originals.push(mk(`p${++n}`,col*32,row*30));
// Solución parcial válida con dos piezas fuera. Probamos directamente la fase amplia,
// que debe poder reconstruir una porción grande y recuperar las 12 piezas.
const placed=originals.slice(0,10);
const missing=originals.slice(10);
const engine=new LoadEngine(trailer,{timeLimitMs:5000,patterns:[],strategies:[]});
const rebuilt=engine.deepRebuildRescue(placed,missing,originals);
if(!rebuilt.length)throw new Error('La reconstrucción profunda no produjo candidatos');
rebuilt.sort((a,b)=>a.unplaced.length-b.unplaced.length);
const best=rebuilt[0];
if(best.unplaced.length!==0)throw new Error(`La reconstrucción profunda dejó ${best.unplaced.length} pilas fuera`);
if(best.stacks.length!==12)throw new Error(`Se esperaban 12 pilas y se obtuvieron ${best.stacks.length}`);
if(!validateLayout(best.stacks,trailer).ok)throw new Error('La reconstrucción profunda produjo colisiones o límites inválidos');
const match=/\((\d+) pilas rearmadas\)/.exec(best.name);
if(!match||Number(match[1])<4)throw new Error('La fase no realizó una reconstrucción amplia');
console.log('PASS v5.6: reconstrucción amplia recuperó dos pilas sin degradar el layout.');
