const fs = require('fs');
const css = fs.readFileSync('styles.css','utf8');
const html = fs.readFileSync('index.html','utf8');
const required = [
  '--badge-bg:#374151',
  'html[data-theme="dark"] .efficiencyRing:before',
  'html[data-theme="dark"] .solutionCard.best',
  'html[data-theme="dark"] .visualLearningCard button:not(.primary)',
  'html[data-theme="dark"] .moreTools button:not(.primary)',
  'html[data-theme="dark"] .historyBadge.complete',
  'html[data-theme="dark"] .historyBadge.pending'
];
for (const needle of required) {
  if (!css.includes(needle)) throw new Error(`Falta regla de contraste: ${needle}`);
}
if (!html.includes('v5.33 CONTRAST FIX')) throw new Error('La interfaz no muestra la versión v5.33');
if (!html.includes('id="themeSelect"')) throw new Error('Falta el selector de tema');
console.log('PASS v5.33: contraste oscuro corregido en etiquetas, resultados, eficiencia y herramientas.');
