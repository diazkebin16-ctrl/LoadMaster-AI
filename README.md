# LoadMaster AI v5.35 — STABLE STACKING

Reconstruida desde la base estable v5.31 DARK MODE.

- El optimizador principal y `optimizer.js` permanecen iguales a v5.31.
- “Buscar apilamiento” es un módulo opcional y aislado.
- Trabaja sobre copias profundas del plano y de la carga pendiente.
- Solo aplica el resultado si reduce la cantidad de pallets pendientes.
- Si falla o no mejora, restaura/conserva el plano original.
- Mantiene el límite de altura más bajo y apoyo completo de la pieza superior.
- Incluye la corrección de contraste oscuro de v5.33.
