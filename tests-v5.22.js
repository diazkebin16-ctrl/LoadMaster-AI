const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
function pos(s){const i=html.indexOf(s);if(i<0)throw new Error('Falta '+s);return i;}
const top=pos('class="sidebar sidebarTop"');
const plan=pos('class="workspace"');
const bottom=pos('class="sidebar sidebarBottom"');
if(!(top<plan&&plan<bottom))throw new Error('El plano no quedó entre configuración y herramientas');
if(!html.includes('id="catalogPanel"')||!html.includes('id="historyPanel"'))throw new Error('Faltan paneles del acordeón');
if(pos('>Herramientas<')>pos('Estadísticas de carga'))throw new Error('Herramientas debe ir antes que estadísticas');
if(pos('Estadísticas de carga')>pos('id="catalogPanel"'))throw new Error('Estadísticas debe ir antes del catálogo');
if(pos('id="catalogPanel"')>pos('id="historyPanel"'))throw new Error('Catálogo debe ir antes del historial');
console.log('PASS v5.22: plano primero y orden de interfaz correcto.');
