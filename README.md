# LoadMaster AI v0.2

Actualización del editor táctil para Android, tablet y computadora.

## Funciones incluidas
- Tráilers guardados: 96×300, 96×330, 95×574, 96×574, 95×628, 96×628 y 98×628.
- Tráiler personalizado.
- Biblioteca editable de pallets.
- Medidas, cantidad, altura máxima, 2-way/4-way, categoría y giro.
- División automática de cantidades en pilas.
- Editor táctil: tocar, arrastrar y soltar.
- Girar, bloquear, duplicar y eliminar pilas.
- Detección de choques y límites.
- Optimización básica y compactación.
- Deshacer y rehacer.
- Guardar y abrir cargas.
- Imprimir o guardar como PDF.
- Funcionamiento offline después de instalarse como PWA.

## Cómo probarla en una computadora
1. Descomprime el ZIP.
2. Abre una terminal dentro de la carpeta.
3. Ejecuta:
   python -m http.server 8000
4. Abre http://localhost:8000 en Chrome.

## Cómo instalarla en Android
La carpeta debe publicarse en GitHub Pages, Netlify o Cloudflare Pages.
Después:
1. Abre el enlace en Chrome.
2. Pulsa el menú de tres puntos.
3. Pulsa “Agregar a pantalla de inicio” o “Instalar aplicación”.

## Importante
Esta es la versión 1. El optimizador es práctico pero todavía no es el motor avanzado
que probará miles de combinaciones, OCR, voz, aprendizaje y nube. Esas funciones se
agregarán sobre esta base después de probar el editor real.


## Correcciones de la versión 0.2
- Arrastre táctil corregido: ya no se destruye el elemento al tocarlo.
- Selección estable de cualquier pila.
- Giro de cualquier pila 4-way; si no cabe en el sitio actual, intenta reubicarla.
- Movimiento fino con botones de 1 o 5 pulgadas.
- Duplicado solo cuando existe espacio válido.
- Mejor manejo de pointercancel y pérdida de captura táctil.
- Caché PWA actualizado para forzar la nueva versión.
