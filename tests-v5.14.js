const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const requiredIds=['catalogList','catalogDialog','catalogSearch','catalogImportInput','newCatalogItem','exportCatalog','importCatalog'];
for(const id of requiredIds){if(!html.includes(`id="${id}"`))throw new Error(`Falta ${id}`);}
const requiredMethods=['openCatalogEditor','saveCatalogEditor','duplicateCatalogItem','deleteCatalogItem','toggleCatalogFavorite','exportCatalog','importCatalog','renderCatalog'];
for(const method of requiredMethods){if(!app.includes(`${method}(`))throw new Error(`Falta método ${method}`);}
if(!app.includes('existing?.id||uid()'))throw new Error('Guardar medida no actualiza la selección existente');
if(/catalogWeight|Peso del pallet|id="catalogWeight"/.test(html+app))throw new Error('Se agregó peso contra lo solicitado');
if(!app.includes('notes:String(raw.notes||raw.notas||\'\')'))throw new Error('Falta compatibilidad de notas');
console.log('PASS v5.14: catálogo editable, actualización de medidas, favoritos e importación/exportación sin peso.');
