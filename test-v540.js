const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.40 PRESTACK COUNT FIX'),'falta versión v5.40');
ok(!html.includes('id="stackAssistBtn" type="button" disabled'),'Buscar apilamiento sigue deshabilitado');
ok(app.includes('function prestackInventoryPlan'),'falta el plan de apilamiento previo');
ok(app.includes('inventory.splice(ui,1)'),'la pila absorbida no se elimina del inventario');
ok(app.includes('const beforeCount=before.stacks.length+before.pending.length'),'falta conteo anterior');
ok(app.includes('const afterCount=plan.stacks.length+plan.pending.length'),'falta conteo posterior');
ok(app.includes('${beforeCount} → ${afterCount} pilas'),'falta confirmación visual de reducción');
ok(sw.includes('loadmaster-ai-v5.40-prestack-count-fix'),'caché incorrecta');
console.log('PASS v5.40 PRESTACK COUNT FIX');
