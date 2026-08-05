# LoadMaster AI v5.6 DEEP REBUILD — Reporte de pruebas

## Objetivo
Conservar la base estable de v5.5 y añadir una reconstrucción verdaderamente amplia cuando queden exactamente una o dos pilas fuera.

## Cambios verificados
- La solución estable anterior permanece entre los candidatos y no se reemplaza por una peor.
- La reconstrucción profunda puede desmontar entre 25 % y 85 % de las pilas móviles, o reconstruir globalmente como último recurso.
- Se prueban rutas realmente distintas: pendientes primero, grandes primero, pequeñas primero, largo primero, ancho primero y combinaciones por filas.
- Solo se activa para una o dos pilas faltantes.
- Mantiene carga pendiente, autocompletado y búsqueda 9→30 segundos.

## Pruebas ejecutadas
- `tests-v5.js`: PASS.
- `tests-v5.1.js`: PASS.
- `tests-v5.2.js`: PASS.
- `tests-v5.3.js`: PASS.
- `tests-v5.5.js`: PASS.
- `tests-v5.6.js`: PASS; reconstrucción amplia recuperó dos pilas y produjo un layout válido.
- `node --check app.js`: PASS.
- `node --check optimizer.js`: PASS.
- Verificación ZIP: PASS.

## Nota
La prueba definitiva sigue siendo la orden real del usuario. El algoritmo es heurístico: aumenta la diversidad y profundidad de búsqueda, pero no constituye una prueba matemática de optimalidad para todos los casos.
