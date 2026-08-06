const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
for(const id of ['saveHistoryBtn','historyName','savedHistoryList','recentHistoryList','clearInternalLearning']){
  if(!html.includes(`id="${id}"`))throw new Error('Falta elemento '+id);
}
for(const token of ['class VisualHistoryMemory','addSaved(entry)','addRecent(entry)','recordRecentOptimization()','renderVisualHistory()','saveCurrentToHistory()']){
  if(!app.includes(token))throw new Error('Falta lógica '+token);
}
if(!app.includes('this.recent=this.recent.slice(0,10)'))throw new Error('El historial reciente no está limitado a 10');
if(!html.includes('<details class="advancedSettings">'))throw new Error('El aprendizaje no está oculto en configuración avanzada');
if((html.match(/id="clearInternalLearning"/g)||[]).length!==1)throw new Error('El botón de aprendizaje aparece más de una vez');
if(!app.includes('Última confirmación: esta acción no se puede deshacer'))throw new Error('Falta doble confirmación de seguridad');
if(!css.includes('.historyItem')||!css.includes('.advancedSettings'))throw new Error('Faltan estilos del historial');
console.log('PASS v5.18: historial manual, últimas 10 y aprendizaje protegido.');
