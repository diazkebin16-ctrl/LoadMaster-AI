# LoadMaster AI v4.5 optimizada — 2026-08-05

Mantiene las reglas operativas de v4.4: límites del tráiler, ausencia de colisiones,
pilas bloqueadas inmóviles y rotación exclusiva de pallets 4-way autorizados.

Mejoras principales:

- límite máximo de búsqueda de 9 segundos;
- haces y órdenes adaptativos según el tamaño de la carga;
- puntuación geométrica sin arreglos temporales innecesarios;
- búsqueda progresiva y refinamiento con límites seguros;
- caché PWA y metadatos actualizados a v4.5.

La optimización es heurística: encuentra la mejor solución válida dentro del tiempo
disponible, pero no garantiza el óptimo matemático absoluto para cargas muy grandes.
