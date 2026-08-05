# LoadMaster AI v4.0 — Engine v2 modular

Reescritura modular del núcleo de la Fase 2. El optimizador trabaja sobre una copia virtual, valida todas las pilas antes de aplicar una solución y nunca acepta pallets fuera del tráiler o superpuestos.

Módulos: geometry, collision, validator, scoring, refine y optimizer. Tráiler predeterminado: 96 × 628 pulgadas.


## v4.1 — Secuencias y rotaciones
- Prueba orientación normal y girada para cada pila 4-way.
- Conserva varias soluciones parciales para evitar descartar giros útiles demasiado pronto.
- Ejecuta búsqueda local de dos acciones: girar/mover una pila y después recolocar otra.
- Rechaza cualquier resultado con superposición o fuera del tráiler.
