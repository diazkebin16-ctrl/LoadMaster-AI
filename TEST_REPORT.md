# Pruebas v5.40

- Botón Buscar apilamiento desactivado antes de optimizar.
- Botón habilitado solo con `hasOptimized=true` y pendientes.
- Guardia interna impide apilar antes del acomodo normal.
- Capacidad vertical se intenta antes de reconstruir.
- Plano normal se restaura si la alternativa no mejora.
- Sintaxis JavaScript y ZIP verificados.


## v5.40 PRESTACK COUNT FIX
- Buscar apilamiento disponible antes y después de optimizar.
- Una pila totalmente absorbida se elimina del inventario activo.
- El conteo total baja cuando corresponde (caso esperado: 39 → 38).
- El optimizador posterior trabaja con el nuevo conjunto reducido de pilas.
