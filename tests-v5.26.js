const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('v5.26 PROGRESSIVE AI'),'Versión visual incorrecta');
for(const id of ['progressiveStatus','progressiveStatusText','stopProgressiveBtn','progressiveOffer','progressiveOfferText','applyProgressiveBtn','compareProgressiveBtn','ignoreProgressiveBtn']) ok(html.includes(`id="${id}"`),`Falta ${id}`);
ok(app.includes('timeLimitMs:3200'),'No existe fase rápida de 3.2 s');
ok(app.includes('30000-elapsed'),'No existe límite progresivo total de 30 s');
ok(app.includes('scheduleProgressiveRound(session)'),'No existe el orquestador progresivo');
ok(app.includes('showProgressiveOffer(candidate,previous)'),'No se ofrece la mejora al usuario');
ok(app.includes('if(enabled&&this.progressiveSession)this.stopProgressiveOptimization(true)'),'La edición manual no detiene la búsqueda');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
ok(ids.length===new Set(ids).size,'Hay IDs HTML duplicados');
console.log('PASS v5.26: solución rápida, búsqueda progresiva, oferta de mejora y pausa manual.');
