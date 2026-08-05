const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout}=sandbox.__LM;
const mk=(id,w,l,x,y)=>({id,name:id,w,l,x,y,qty:1,type:'4-way',canRotate:true,locked:false});
// Plano que cabe completo: 3 filas de dos pallets 48x40. Se alteran tres pilas deliberadamente.
const disturbed=[
  mk('a',48,40,0,0),mk('b',48,40,48,0),mk('c',48,40,0,40),
  mk('d',48,40,130,40),mk('e',48,40,0,180),mk('f',48,40,150,200)
];
const trailer={width:96,length:120};
const r=new LoadEngine(trailer,{timeLimitMs:2500,strategies:[]}).optimize(disturbed);
if(!r.ok)throw new Error('No produjo solución');
if(r.solutions[0].loadedStacks!==6)throw new Error(`No reacomodó las tres pilas: ${r.solutions[0].loadedStacks}/6`);
if(!validateLayout(r.solutions[0].stacks,trailer).ok)throw new Error('La solución reacomodada es inválida');
// Una estrategia aprendida debe aceptarse sin romper el motor.
const strategy={sequence:[{w:48,l:40,type:'4-way'},{w:48,l:40,type:'4-way'}]};
const r2=new LoadEngine(trailer,{timeLimitMs:1200,strategies:[strategy]}).optimize(disturbed);
if(!r2.ok||r2.solutions[0].loadedStacks!==6)throw new Error('La memoria de estrategias no pudo reutilizar una secuencia válida');
console.log('PASS v5.3: reacomodo de tres pilas, reconstrucción válida y memoria de estrategias.');
