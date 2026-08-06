const fs=require('fs'),vm=require('vm');
let code=fs.readFileSync('app.js','utf8').replace(/new App\(\);\s*$/m,'');
const context={console,setTimeout,clearTimeout,structuredClone:global.structuredClone,crypto:{randomUUID:()=>Math.random().toString(36)},localStorage:{getItem:()=>null,setItem:()=>{}},sessionStorage:{getItem:()=>null,setItem:()=>{}},navigator:{onLine:true},window:{matchMedia:()=>({matches:false,addEventListener(){}})},document:{readyState:'complete',documentElement:{dataset:{}},getElementById:()=>null,querySelector:()=>null,addEventListener(){}}};
vm.createContext(context);vm.runInContext(code,context);
const result=vm.runInContext(`mixedStackingPlan(
 [{id:'b',name:'42x42',w:42,l:42,qty:6,maxHeight:21,type:'2-way',canRotate:false,x:0,y:0}],
 [{id:'u',name:'42x34 Block',w:42,l:34,qty:10,maxHeight:16,type:'4-way',canRotate:true,x:0,y:0}],
 [],{width:96,length:628})`,context);
if(!result.ok)throw new Error('plan inválido');
if(result.pending.length!==0)throw new Error('no consumió pendiente');
if(result.stacks.length!==1)throw new Error('movió o creó piso adicional');
if(result.stacks[0].qty!==16)throw new Error('altura total incorrecta '+result.stacks[0].qty);
if(!Array.isArray(result.stacks[0].layers)||result.stacks[0].layers.length!==2)throw new Error('no creó capas');
const html=fs.readFileSync('index.html','utf8');
if(!html.includes('id="autoArrangeOnAdd"'))throw new Error('falta toggle');
if(!code.includes('findSoftPlacement'))throw new Error('falta autoacomodo');
console.log('v5.37 direct vertical capacity + auto arrange: OK');
