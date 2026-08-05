const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry,solutionDistance};');
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout,solutionDistance}=sandbox.__LM;
const mk=(id,w,l,qty=20)=>({id,name:id,w,l,x:0,y:700,qty,type:'4-way',canRotate:true,locked:false});
const input=[
 mk('a1',42,42),mk('a2',42,42),mk('a3',42,42),mk('a4',42,42),
 mk('b1',34,42),mk('b2',34,42),mk('b3',34,42),mk('b4',34,42),
 mk('c1',28,28),mk('c2',28,28),mk('c3',28,28),mk('c4',28,28)
];
const trailer={width:96,length:190};
const r=new LoadEngine(trailer,{timeLimitMs:10000}).optimize(input);
if(!r.ok||!r.solutions.length)throw new Error('No produjo soluciones');
for(const sol of r.solutions)if(!validateLayout(sol.stacks,trailer).ok)throw new Error('Solución inválida');
if(r.solutions.length>1){
  const d=solutionDistance(r.solutions[0],r.solutions[1],trailer);
  if(d<0.02)throw new Error(`Opciones demasiado parecidas: ${d}`);
}
if(r.solutions[0].loadedStacks<Math.max(...r.solutions.map(s=>s.loadedStacks)))throw new Error('La primera opción no conserva la mejor carga');
console.log('PASS v5.7: opciones diversas, mejor solución preservada y layouts válidos.');
