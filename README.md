# LoadMaster AI v5.5 LAST MILE

Esta versión parte de **v5.3 ADAPTIVE**, la última base estable que lograba dejar solamente dos pilas pequeñas fuera en la carga difícil del usuario.

## Cambios

- Fase de **rescate final dirigido** cuando faltan de 1 a 3 pilas.
- Reconstruye únicamente zonas candidatas: parte trasera, bloques cercanos al final y grupos pequeños que pueden intercambiarse.
- Da prioridad a las pilas pendientes durante la reconstrucción.
- Conserva la solución anterior entre los candidatos: la fase nueva **nunca debe reducir la cantidad cargada**.
- Mantiene búsqueda 9→30 segundos, reconstrucción por zonas, carga pendiente y memoria de estrategias de v5.3.
- Corrige autocompletado de pallets antiguos con propiedades `w/l`, `width/length` o `ancho/largo`.
- Evita mostrar `undefined`; avisa claramente cuando un registro realmente carece de medidas válidas.

## Pruebas

Ejecutar:

```bash
node tests-v5.js
node tests-v5.1.js
node tests-v5.2.js
node tests-v5.3.js
node tests-v5.5.js
```
