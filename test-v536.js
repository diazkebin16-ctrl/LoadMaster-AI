const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
function ok(c,m){if(!c)throw new Error(m)}
ok(app.includes('function buildStackingFirstLoad'),'falta constructor de carga apilada');
ok(app.includes("const profiles=['tight','balanced','upper-heavy','base-heavy','large-base']"),'faltan perfiles independientes');
ok(app.includes('originalStackGroups(before.stacks,before.pending')===false,'la implementación no debe depender de una llamada accidental directa');
ok(app.includes('const input=buildStackingFirstLoad(before.stacks,before.pending'),'no reconstruye desde cantidades originales');
ok(app.includes("family:'Apilamiento previo'"),'falta familia de solución');
ok(app.includes("(best.loadedPallets||0)<=baselinePallets"),'no protege el plano normal');
ok(app.includes('this.state.stacks=before.stacks;this.state.pending=before.pending'),'no restaura respaldo');
ok(html.includes('v5.36 STACK FIRST'),'versión HTML incorrecta');
console.log('v5.36 stack-first: OK');
