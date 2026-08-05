# Informe de pruebas — LoadMaster AI v5.12 REPEATABLE SOLVER

## Cambios verificados

- Normalización y compactación obligatoria de cada candidato finalista antes de puntuarlo.
- Reinserción automática de pilas pendientes después de compactar.
- Varias rondas independientes con semillas distintas dentro del límite total de 30 segundos.
- Memoria automática de soluciones completas mediante patrones comprobados.
- Conservación del mejor resultado anterior y rechazo de soluciones inferiores.
- Control de rendimiento: normalización de los candidatos más fuertes y representantes de cada familia.

## Pruebas aprobadas

- v5.0: patrones y restricciones de rotación.
- v5.1/v5.2: carga parcial, validación y combinaciones de ancho.
- v5.3: recuperación después de mover tres pilas y memoria de estrategias.
- v5.5: rescate de dos pilas y compatibilidad del autocompletado.
- v5.6: reconstrucción amplia sin degradación.
- v5.7: diversidad de soluciones.
- v5.8: portafolio independiente y piso de calidad.
- v5.9: escape de óptimo local.
- v5.10: planificación estructural.
- v5.11: compactación por gravedad e inserción de dos pendientes.
- v5.12: normalización obligatoria, reinserción y estabilidad repetible.

## Validaciones adicionales

- `app.js` y `optimizer.js` pasan la comprobación de sintaxis de Node.js.
- Todos los layouts de las pruebas pasan validación de límites y colisiones.
- No se pierden pilas durante la compactación o reinserción.
