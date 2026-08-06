const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('id="compactPlanCanvas"'),'Falta canvas compacto');
ok(html.includes('id="manualModeBtn"'),'Falta botón Acomodar manualmente');
ok(html.includes('id="finishManualBtn"'),'Falta botón Finalizar edición');
ok(html.includes('id="manualCanvasWrap"'),'Falta contenedor manual');
ok(app.includes('setManualEditMode(enabled)'),'Falta cambio de modo');
ok(app.includes('renderCompactPlan()'),'Falta render compacto');
ok(app.includes('if(this.manualEditMode)this.wireDrag(el,s)'),'El arrastre no está limitado al modo manual');
ok(css.includes('.compactPlanWrap'),'Faltan estilos compactos');
ok(/v5\.23|5\.23/.test(html+app),'Versión incorrecta');
console.log('PASS v5.23: vista compacta horizontal y edición manual vertical.');
