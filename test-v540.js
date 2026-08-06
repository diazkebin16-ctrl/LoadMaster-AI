const fs=require('fs');
const src=fs.readFileSync('./app.js','utf8');
function extract(name){
  const start=src.indexOf(`function ${name}`); if(start<0) throw new Error(`Missing ${name}`);
  const next=src.indexOf('\n  function mixedStackingPlan',start);
  if(name==='prestackMergePlan'&&next>start)return src.slice(start,next);
  throw new Error('Unsupported extract');
}
const EPS=.001;let id=0;const uid=()=>`t${++id}`;
const Geometry={clone:x=>JSON.parse(JSON.stringify(x))};
function libraryMaxHeightFor(stack,library=[]){return Math.max(1,Number(stack.maxHeight)||Number(stack.qty)||1)}
function stackLayersFor(stack,library=[]){
  if(Array.isArray(stack?.layers)&&stack.layers.length)return stack.layers.map(x=>({...Geometry.clone(x),qty:Math.max(1,Number(x.qty)||1),maxHeight:Math.max(1,Number(x.maxHeight)||libraryMaxHeightFor(x,library))}));
  return [{id:stack.id,name:stack.name,w:Number(stack.w),l:Number(stack.l),qty:Math.max(1,Number(stack.qty)||1),maxHeight:libraryMaxHeightFor(stack,library),type:stack.type||'4-way',canRotate:stack.canRotate!==false,category:stack.category||'Otra'}];
}
function topSupportFor(stack,library=[]){const layers=stackLayersFor(stack,library),top=layers[layers.length-1];return {w:Number(top.w),l:Number(top.l),layers};}
function fitUpperOrientation(upper,support){
  const options=[{w:Number(upper.w),l:Number(upper.l),rotated:false}];
  if(upper.canRotate!==false&&upper.type==='4-way'&&Math.abs(Number(upper.w)-Number(upper.l))>EPS)options.push({w:Number(upper.l),l:Number(upper.w),rotated:true});
  return options.filter(o=>o.w<=support.w+EPS&&o.l<=support.l+EPS).sort((a,b)=>(support.w*support.l-a.w*a.l)-(support.w*support.l-b.w*b.l))[0]||null;
}
function preparePreviewLayout(stacks,trailer){return {placed:Geometry.clone(stacks),pending:[]}}
eval(extract('prestackMergePlan'));
function ok(v,m){if(!v)throw new Error(m)}
const base={id:'base',name:'42x42',w:42,l:42,qty:6,maxHeight:21,type:'4-way',canRotate:true,x:0,y:0};
const upper={id:'upper',name:'42x34 Block',w:42,l:34,qty:10,maxHeight:16,type:'4-way',canRotate:true,x:0,y:50};
const extra=Array.from({length:37},(_,i)=>({id:`e${i}`,name:'28x28',w:28,l:28,qty:20,maxHeight:20,type:'4-way',canRotate:true,x:0,y:100+i}));
const result=prestackMergePlan([base,upper,...extra],[],[],{width:100,length:636});
ok(result.ok,'No prestack result');
ok(result.beforeCount===39,`Expected 39 before, got ${result.beforeCount}`);
ok(result.afterCount===38,`Expected 38 after, got ${result.afterCount}`);
ok(result.removedCount===1,`Expected one removed stack, got ${result.removedCount}`);
const mixed=result.stacks.find(s=>s.id==='base');
ok(mixed && mixed.qty===16,'Base did not become 16 pallets');
ok(Array.isArray(mixed.layers)&&mixed.layers.length===2,'Mixed layers missing');
ok(!result.stacks.some(s=>s.id==='upper'),'Absorbed stack still exists');
console.log('v5.40 prestack count test: PASS');
