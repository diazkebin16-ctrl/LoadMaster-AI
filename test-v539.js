const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.39 NORMAL FIRST'),'falta versión');
ok(html.includes('id="stackAssistBtn" type="button" disabled'),'el botón debe iniciar desactivado');
ok(app.includes('if(!this.hasOptimized)'),'falta guardia previa');
ok(app.includes('button.disabled=!(this.hasOptimized&&(this.state.pending||[]).length)'),'estado del botón incorrecto');
ok(app.includes('Segundo recurso: primero aprovecha capacidad vertical'),'orden incorrecto');
ok(app.includes('El acomodo normal sigue siendo mejor; no se cambió el plano.'),'falta salvaguarda');
ok(sw.includes('loadmaster-ai-v5.39-normal-first'),'caché incorrecta');
console.log('OK v5.39');
