const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
const requiredIds=['patternEditStatus','cancelPatternEdit','statsGrade','statsUsedArea','statsFreeArea','statsDeadArea','statsGapCount','statsMaxHeight','statsRemainingLength','statsOptimizeTime','statsWinningStrategy'];
for(const id of requiredIds){if(!html.includes(`id="${id}"`))throw new Error('Falta elemento '+id);}
for(const token of ['editPattern(id)','duplicatePattern(id)','deletePattern(id)','renderLoadStatistics()','calculateLoadStatistics']){if(!app.includes(token))throw new Error('Falta lógica '+token);}
if(!css.includes('.loadStatsCard'))throw new Error('Faltan estilos de estadísticas');
if(!html.includes('v5.16 PATTERNS & STATISTICS'))throw new Error('Versión visual incorrecta');
console.log('PASS v5.16: edición de patrones y panel de estadísticas conectados.');
