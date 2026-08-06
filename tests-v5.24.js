const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const pos=id=>html.indexOf(`id="${id}"`);
if(!(pos('trailerSettings')<pos('quickToolsCard') && pos('quickToolsCard')<pos('compactPlanWrap'))) throw new Error('Orden incorrecto: configuración > herramientas > plano');
for(const id of ['optimizeBtn','retryOptimizeBtn','compactBtn','manualModeBtn','finishManualBtn','saveReportBtn','shareReportBtn']) if(pos(id)<0) throw new Error(`Falta ${id}`);
if(!/class="moreTools"/.test(html)) throw new Error('Falta menú Más herramientas');
console.log('PASS v5.24: herramientas encima del plano y menú secundario desplegable.');
