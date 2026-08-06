# Pruebas v5.37

- `node --check app.js`: OK
- `node --check optimizer.js`: OK
- IDs HTML únicos: 170
- Control `Autoacomodo al agregar`: conectado y persistente
- Prueba directa de capacidad vertical: OK
  - base 42×42, cantidad 6, máximo 21
  - superior 42×34, cantidad 10, máximo 16
  - resultado: una pila mixta de 16, sin pendientes y sin mover el piso
- Salvaguarda: si no hay mejora, se conserva el plano normal
- Se corrigió un error heredado en la comparación de orientaciones (`fitUpperOrientation`)
