const fs=require("fs");
const html=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('id="trailerSettings"')&&html.includes('<details'),"Falta panel desplegable");
ok(!html.includes('<h2>Pila seleccionada</h2>'),"La tarjeta Pila seleccionada sigue visible");
ok(html.includes('id="catalogList" hidden'),"La lista duplicada del catálogo sigue visible");
ok(app.includes('lm_trailer_panel_open'),"No se recuerda el estado del panel");
ok(app.includes('catalogSearchStatus'),"La búsqueda no filtra el selector Biblioteca");
console.log("PASS v5.19: interfaz compacta y catálogo simplificado.");
