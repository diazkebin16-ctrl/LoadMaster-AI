const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');let src=fs.readFileSync('app.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.28 MOVEMENT SIMULATOR'),'Versión visual incorrecta');
ok(src.includes('simulateMovementSequences(placed,unplaced,originals'),'Falta motor de simulación');
ok(src.includes("family:'Simulación'"),'No se generan candidatos simulados');
ok(src.includes("type:'swap'"),'Falta simulación de intercambios');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry};');
const sandbox={console,Date,Math,performance:{now:()=>0},setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null,createElement:()=>({})},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);const {LoadEngine,validateLayout}=sandbox.__LM;
const trailer={width:96,length:180};let n=0;const mk=(w,l,x,y)=>({id:'m'+(++n),name:'p',w,l,x,y,qty:1,type:'4-way',canRotate:true,locked:false});
const placed=[mk(34,28,0,0),mk(34,28,36,0),mk(28,28,68,0),mk(34,28,0,35),mk(34,28,36,35),mk(28,28,68,45)];
const pending=[mk(28,28,0,0)];const originals=[...placed,...pending].map(x=>({...x}));
const before=JSON.stringify(placed);const engine=new LoadEngine(trailer,{timeLimitMs:2500});
const out=engine.simulateMovementSequences(placed,pending,originals,{maxDepth:2,beamWidth:12});
ok(JSON.stringify(placed)===before,'La simulación modificó el plano original');
for(const c of out)ok(validateLayout(c.stacks,trailer).ok,'La simulación produjo un plano inválido');
console.log('PASS v5.28: simulación segura sobre copias, secuencias y validación.');