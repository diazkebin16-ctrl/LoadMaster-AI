'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname,html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const ids=['historySearch','historyDateFrom','historyDateTo','historyStatusFilter','historySort','historyFavoritesOnly','historySelectedCount','compareHistoryBtn','exportHistoryPdfBtn','exportHistoryCsvBtn','deleteHistorySelectedBtn','comparisonPanel','comparisonContent','closeComparisonBtn'];
for(const id of ids)if(!html.includes(`id="${id}"`))throw new Error(`Falta ID ${id}`);
for(const token of ['compareSelectedHistory()','exportSelectedHistoryPdf()','exportSelectedHistoryCsv()','filterAndSortHistory(','canvasesToPdfBlob('])if(!app.includes(token))throw new Error(`Falta lógica ${token}`);
for(const token of ['comparisonPanel','historyFilters','historyBatchToolbar','metricWinner'])if(!css.includes(token))throw new Error(`Falta estilo ${token}`);
console.log('PASS v5.20: comparador, reportes automáticos e historial avanzado.');
