const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync('app.js','utf8');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={LoadEngine,validateLayout,Geometry,normalizeLibraryItem};');
const elements=new Map();
const el=()=>({value:'',textContent:'',checked:false,classList:{add(){},remove(){}},addEventListener(){},appendChild(){},querySelector(){return null;},style:{},options:[],innerHTML:'',hidden:false});
const sandbox={console,Date,Math,setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);},querySelector:()=>null,createElement:()=>el()},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())},URL:{revokeObjectURL(){},createObjectURL(){return ''}}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {LoadEngine,validateLayout,normalizeLibraryItem}=sandbox.__LM;

// Compatibilidad con medidas antiguas: largo/ancho pueden venir con nombres completos o en español.
const legacy=normalizeLibraryItem({id:'old',name:'42x34',width:'34',length:'42',height:'20',type:'4-way'});
if(legacy.w!==34||legacy.l!==42||legacy.maxHeight!==20)throw new Error(`Normalización antigua incorrecta: ${JSON.stringify(legacy)}`);
const spanish=normalizeLibraryItem({nombre:'28x28',ancho:28,largo:28,altura:16,tipo:'4-way'});
if(spanish.w!==28||spanish.l!==28||spanish.maxHeight!==16)throw new Error('No recuperó propiedades en español');

// Los reintentos deben usar semillas diferentes pero producir siempre layouts válidos.
const mk=(id,w,l,x=0,y=0)=>({id,name:id,w,l,x,y,qty:1,type:'4-way',canRotate:true,locked:false});
const input=[
  mk('a',48,40,0,0),mk('b',48,40,48,0),mk('c',48,40,0,40),
  mk('d',48,40,130,40),mk('e',48,40,0,180),mk('f',48,40,150,200)
];
const trailer={width:96,length:120};
let best=0;
for(let seedOffset=1;seedOffset<=3;seedOffset++){
  const r=new LoadEngine(trailer,{timeLimitMs:1800,patterns:[],strategies:[],seedOffset}).optimize(input);
  if(!r.ok)throw new Error(`Reintento ${seedOffset} no produjo solución`);
  if(!validateLayout(r.solutions[0].stacks,trailer).ok)throw new Error(`Reintento ${seedOffset} inválido`);
  best=Math.max(best,r.solutions[0].loadedStacks);
}
if(best!==6)throw new Error(`Los reintentos automáticos no recuperaron la carga completa: ${best}/6`);

const appText=fs.readFileSync('app.js','utf8');
if(!appText.includes('for(let attempt=1;attempt<=3;attempt++)'))throw new Error('No existe la pasada automática de tres reintentos');
if(appText.includes('undefined largo × undefined ancho'))throw new Error('Persistió el mensaje undefined');
console.log('PASS v5.4: reintentos automáticos, layouts válidos y autocompletado compatible con medidas antiguas.');
