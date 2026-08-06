# Pruebas v5.38

- `node --check app.js`: OK
- `node --check optimizer.js`: OK
- IDs HTML únicos: 170
- Botón `Buscar apilamiento` disponible antes de optimizar: OK
- Preparación previa conserva la cantidad total de pallets: OK
- Caso 42×42 (6) + 42×34 (10), límite menor 16: crea pila mixta válida
- Flujo posterior de capacidad vertical v5.37: OK
- Al agregar carga nueva se reinicia el estado de optimización: OK
- Pruebas específicas de preparación previa y capacidad vertical posterior: OK
