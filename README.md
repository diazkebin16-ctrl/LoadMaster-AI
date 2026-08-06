# LoadMaster AI v5.30 PHOTO LOAD READER

Agrega lectura de órdenes desde cámara o fotografía cuando existe conexión a Internet. La imagen se envía a la API de visión configurada por el usuario y los datos detectados siempre pasan por una tabla editable antes de agregarse a la carga.

## Seguridad y despliegue

Esta aplicación sigue siendo estática. Por seguridad, no incluye una clave de API integrada. El usuario introduce una clave de OpenAI que se conserva únicamente durante la sesión del navegador. Para una distribución comercial, se recomienda reemplazar la llamada directa por un endpoint propio seguro que mantenga la clave en el servidor.

## Sin conexión

La cámara/lectura IA se deshabilita y la carga se agrega manualmente como en versiones anteriores.
