# LoadMaster AI v5.38 PRESTACK ANYTIME

Base real: v5.36 STACK FIRST suministrada por el usuario.

## Cambios
- Buscar apilamiento está disponible antes de optimizar.
- Antes de optimizar forma pilas mixtas y conserva el total de pallets.
- Después de optimizar intenta primero aprovechar capacidad vertical sin mover el piso.
- Si eso no basta, prueba reconstrucción apilada y solo la aplica si carga más pallets.
- Las pilas nuevas se autoacomodan suavemente en el primer espacio válido; las que no caben pasan a pendientes.
- El plano anterior se restaura si una prueba de apilamiento falla o no mejora.
