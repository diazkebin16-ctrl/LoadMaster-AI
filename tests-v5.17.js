const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
for(const id of ['efficiencyRing','efficiencyScore','efficiencyLabel','efficiencyExplanation','saveReportBtn','shareReportBtn','clearInternalLearning']){
  if(!html.includes(`id="${id}"`))throw new Error('Falta elemento '+id);
}
for(const token of ['calculateEfficiencyIndicator','canvasToPdfBlob','createProfessionalReportCanvas','saveProfessionalPdf','shareProfessionalReport','clearInternalLearning']){
  if(!app.includes(token))throw new Error('Falta lógica '+token);
}
if(!app.includes('filter(p=>p&&!p.autoComplete)'))throw new Error('La biblioteca no oculta patrones automáticos');
if(!app.includes('this.patternMemory.patterns.filter(p=>!p.autoComplete)'))throw new Error('No se puede borrar solo aprendizaje interno');
if(!app.includes("type:'application/pdf'")&&!app.includes('type:"application/pdf"'))throw new Error('El reporte no produce PDF');
if(!app.includes('navigator.share'))throw new Error('Falta Web Share');
if(!css.includes('.efficiencyRing'))throw new Error('Faltan estilos del indicador');
console.log('PASS v5.17: eficiencia, PDF, compartir y patrones automáticos ocultos.');
