# LoadMaster AI v5.0 — Aprendizaje visual confirmado

Versión de prueba con motor heurístico de 9 segundos y memoria local de patrones.

## Aprendizaje visual

1. Importe una captura PNG, JPG o WebP como referencia.
2. Reproduzca o corrija el acomodo en el tráiler.
3. Use **Detectar filas** para revisar firmas como `48+48` o `34+34+28`.
4. Use **Guardar patrón** solamente cuando el acomodo sea correcto.
5. En cargas futuras, pulse **Usar** o ejecute **Optimización IA**; el motor probará primero patrones compatibles.

La captura no se sube ni se guarda completa. El navegador conserva localmente únicamente el patrón geométrico confirmado, su nombre y metadatos básicos del archivo. Esto evita aprender errores mediante reconocimiento visual incierto.

Reglas conservadas: tráiler 96×628 por defecto, rotación exclusiva de 4-way autorizados, pilas bloqueadas inmóviles, validación de límites y colisiones, y búsqueda máxima de 9 segundos.
