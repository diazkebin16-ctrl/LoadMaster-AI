# LoadMaster AI v0.7 — Scroll vertical corregido

Correcciones:
- El área gris y el fondo del tráiler desplazan la página hacia arriba y abajo.
- Se eliminó por completo el scroll interno del editor.
- Se bloqueó el desplazamiento horizontal accidental de toda la página.
- Solo las pilas capturan el gesto para moverse.
- La barra inferior ocupa exactamente el ancho de la pantalla.
- Los tres botones aparecen completos en una sola fila.
- El nombre de la pila se oculta en teléfonos para dejar más espacio.
- Tocar el fondo quita la selección solamente si fue un toque, no un deslizamiento.

## Actualización
Sube los siete archivos a la raíz de LoadMaster-AI, reemplaza los anteriores
y realiza un commit.


## v1.0 — compactación avanzada
- Tráiler inicial: 96×628.
- Compactar reconstruye las pilas desbloqueadas con búsqueda por esquinas.
- Prueba varias órdenes y rotaciones permitidas para minimizar el largo usado.
- Respeta pilas bloqueadas, límites del tráiler y reglas 2-way/4-way.
- La caché de la PWA fue actualizada para evitar cargar código anterior.
