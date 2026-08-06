const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');let src=fs.readFileSync('app.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.29 SMART RANKING'),'Versión visual incorrecta');
ok(src.includes('intelligentSolutionRank(sol,trailer,best=null)'),'Falta ranking inteligente');
ok(src.includes('rankSolutionsIntelligently(solutions,trailer)'),'Falta ordenar soluciones por ranking');
ok(src.includes('rankReasons'),'Falta explicación del ranking');
src=src.replace(/new App\(\);\s*$/,'globalThis.__LM={rankSolutionsIntelligently,selectDiverseSolutions};');
const sandbox={console,Date,Math,performance:{now:()=>0},setTimeout:()=>{},clearTimeout:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({}),querySelector:()=>null,createElement:()=>({})},window:{addEventListener:()=>{}},navigator:{},crypto:{randomUUID:()=>String(Math.random())}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);const {rankSolutionsIntelligently,selectDiverseSolutions}=sandbox.__LM;
const trailer={width:96,length:628};
const mk=(name,pallets,stacks,eff,used,pending,x)=>({name,family:name,loadedPallets:pallets,loadedStacks:stacks,efficiency:eff,used,score:100,moved:1,rotated:0,unplacedStacks:pending,unplacedPallets:pending,unplaced:Array.from({length:pending},(_,i)=>({id:'u'+i,qty:1})),stacks:[{id:name,x,y:0,w:42,l:42,qty:pallets}]});
const complete=mk('Completa',100,10,94,500,0,0),partial=mk('Parcial',99,10,99,450,1,10),wasteful=mk('Completa larga',100,10,85,610,0,20);
const ranked=rankSolutionsIntelligently([partial,wasteful,complete],trailer);
ok(ranked[0].loadedPallets===100,'El ranking no priorizó la mayor carga');
ok(ranked[0].name==='Completa','No eligió la solución completa más eficiente');
ok(ranked.every(x=>Number.isFinite(x.rankScore)&&x.rankLabel),'Faltan puntuaciones o etiquetas');
const selected=selectDiverseSolutions(ranked,3,trailer);ok(selected.length===3,'No seleccionó tres soluciones');
console.log('PASS v5.29: ranking inteligente, carga prioritaria y explicaciones.');