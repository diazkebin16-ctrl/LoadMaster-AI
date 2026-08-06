# Informe de pruebas — LoadMaster AI v5.41

## Cambios verificados

- Apilado automático antes del acomodo.
- Las pilas normales se forman primero; solo se combinan pilas incompletas compatibles.
- Una pila superior debe caber completamente en la base.
- La altura total combinada nunca supera el límite más bajo de las capas.
- Las soluciones completas reciben prioridad absoluta sobre las incompletas.
- Se corrigió un bucle duplicado en el rescate de apilamiento posterior.
- Se actualizó la versión y la caché PWA a v5.41.

## Pruebas ejecutadas

- Validación de sintaxis de todos los archivos JavaScript principales: aprobada.
- Prueba heredada de reducción de posiciones por apilado: aprobada.
- Caso 35 pallets 145×26 + 15 pallets 120×24: crea automáticamente una pila 5+5 y conserva todas las cantidades.
- Caso completo del usuario: produce 29 posiciones de piso y conserva 312 pallets.

## Archivos de producción

La carpeta de producción contiene únicamente los archivos necesarios para ejecutar la aplicación. Las pruebas y módulos fuente separados se conservan en la edición de desarrollo.
