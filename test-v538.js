const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.38 PRESTACK ANYTIME'),'versión visual incorrecta');
ok(!html.includes('id="stackAssistBtn" type="button" disabled'),'el botón sigue deshabilitado en HTML');
ok(app.includes('if(!this.hasOptimized)'),'falta el modo previo a optimizar');
ok(app.includes('mixedStackingPlan(before.stacks,before.pending'),'falta capacidad vertical posterior');
ok(app.includes('findFirstValidPlacement'),'falta autoacomodo al agregar');
ok(app.includes("this.hasOptimized=false;this.lastWinningStrategy='Manual / sin optimizar'"),'agregar pallets no reinicia el modo previo');
ok(app.includes('preparedTotal!==totalPallets'),'falta protección de conservación de pallets');
ok(app.includes('(best.loadedPallets||0)<=baselinePallets'),'falta protección del plano normal');
ok(sw.includes('loadmaster-ai-v5.38-prestack-anytime'),'caché incorrecta');
console.log('PASS v5.38: apilamiento antes/después y autoacomodo suave.');
