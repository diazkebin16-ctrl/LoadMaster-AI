const fs=require('fs'),vm=require('vm');
let code=fs.readFileSync('app.js','utf8').replace(/new App\(\);\s*$/m,'');
const context={console,setTimeout,clearTimeout,structuredClone:global.structuredClone,crypto:{randomUUID:()=>Math.random().toString(36)},localStorage:{getItem:()=>null,setItem:()=>{}},sessionStorage:{getItem:()=>null,setItem:()=>{}},navigator:{onLine:true},window:{matchMedia:()=>({matches:false,addEventListener(){}})},document:{readyState:'complete',documentElement:{dataset:{}},getElementById:()=>null,querySelector:()=>null,addEventListener(){}}};
vm.createContext(context);vm.runInContext(code,context);
const prepared=vm.runInContext(`buildStackingFirstLoad(
 [{id:'b',name:'42x42',w:42,l:42,qty:6,maxHeight:21,type:'2-way',canRotate:false,x:0,y:0}],
 [{id:'u',name:'42x34 Block',w:42,l:34,qty:10,maxHeight:16,type:'4-way',canRotate:true,x:0,y:0}],
 [],'balanced')`,context);
const total=prepared.reduce((n,s)=>n+(Number(s.qty)||1),0);
if(total!==16)throw new Error('se perdieron pallets al preparar: '+total);
const mixed=prepared.find(s=>Array.isArray(s.layers)&&s.layers.length===2);
if(!mixed)throw new Error('no creó pila mixta antes de optimizar');
if(mixed.qty>16)throw new Error('no respetó límite menor');
const html=fs.readFileSync('index.html','utf8');
if(/id="stackAssistBtn"[^>]*disabled/.test(html))throw new Error('botón sigue bloqueado antes de optimizar');
if(!code.includes('prepareMixedStacksBeforeOptimization'))throw new Error('falta flujo previo');
if(!code.includes('if(!hasOptimizedPlan)return this.prepareMixedStacksBeforeOptimization()'))throw new Error('no cambia de modo antes/después');
if(!code.includes('this.lastSolutions=[];this.lastOptimizationMs=0;this.lastWinningStrategy="Manual / sin optimizar"'))throw new Error('agregar carga no reinicia estado de optimización');
console.log('v5.38 pre-stack before/after optimization: OK');
