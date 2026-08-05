/* Prueba reproducible del motor v5.0. Ejecutar desde esta carpeta: node tests-v5.js */
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('app.js','utf8');
const engine=src.split('// ===== app.js =====')[0]+'\nthis.LoadEngine=LoadEngine;this.validateLayout=validateLayout;this.Geometry=Geometry;';
const ctx={console,Date,Math,JSON};vm.createContext(ctx);vm.runInContext(engine,ctx);
const {LoadEngine,validateLayout,Geometry}=ctx;let id=0;
const stack=(w,l,extra={})=>({id:`s${++id}`,name:`${w}x${l}`,w,l,x:0,y:100+id*40,qty:20,type:'4-way',canRotate:true,locked:false,rotated:false,...extra});
const assert=(v,m)=>{if(!v)throw new Error(m)};
const pattern={id:'p1',name:'34+34+28',trailer:{width:96,length:628},pieces:[{w:34,l:40,x:0,y:0},{w:34,l:40,x:34,y:0},{w:28,l:40,x:68,y:0}]};
const input=[stack(34,40),stack(34,40),stack(28,40)];
const report=new LoadEngine({width:96,length:628},{timeLimitMs:1500,patterns:[pattern]}).optimize(input);
assert(report.ok,'No se encontró solución');const learned=report.solutions.find(s=>s.name.includes('Patrón aprendido'));
assert(learned,'No se usó el patrón');assert(validateLayout(learned.stacks,{width:96,length:628}).ok,'Solución inválida');assert(Geometry.usedLength(learned.stacks)===40,'Largo inesperado');
id=0;const two=[stack(48,40,{type:'2-way',canRotate:false})];const rotatedPattern={id:'p2',name:'giro',trailer:{width:96,length:628},pieces:[{w:40,l:48,x:0,y:0}]};
assert(new LoadEngine({width:96,length:628},{patterns:[rotatedPattern]}).patternSeeds(two).length===0,'Un 2-way fue girado');
console.log('PASS LoadMaster AI v5.0');
