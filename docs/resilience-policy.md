# Política de resiliencia de ubicación

## 1. Proveedor de geocodificación

La integración implementada usa el backend didáctico controlado de CampusOps. Este servicio es un doble determinista: no consulta lugares reales ni representa un proveedor de producción. El adaptador `GeoCodingAdapter` recibe el `CourseHttpClient` ya configurado y llama `GET /v1/geocoding?q=<consulta codificada>`; no fija una URL, un actor ni credenciales por su cuenta. Por ello conserva la URL base, `Authorization` y `X-Course-Actor` de la composición existente. La consulta se recorta en sus extremos y se codifica con `encodeURIComponent`.

Una respuesta sólo es utilizable si es un objeto no nulo y no es un arreglo, `label` es texto no vacío, y `latitude` y `longitude` son números finitos. La latitud debe estar entre -90 y 90 y la longitud entre -180 y 180, incluidos los límites y el valor cero. El adaptador devuelve exactamente esos datos válidos o `null`; no inventa coordenadas. Una consulta vacía devuelve `null` sin iniciar HTTP.

## 2. Ejecución externa y pruebas sin cuotas

Las pruebas automatizadas inyectan un `fetch` controlado en el `CourseHttpClient` real. Así reproducen respuestas exitosas, errores HTTP, 429, desconexión, JSON inválido y timeout durante la solicitud o durante la lectura del cuerpo, sin red real, cuotas ni disponibilidad de terceros. Los valores no representables fielmente en JSON, como `NaN` e infinito, se prueban mediante un doble de `requestJson` para evitar que `JSON.stringify` los convierta en `null`.

No se ha realizado una ejecución con un proveedor externo real. El backend didáctico y las pruebas sin red no constituyen evidencia de esa integración externa; si el equipo elige posteriormente un proveedor real, deberá documentar por separado sus restricciones y una ejecución con datos ficticios.

## 3. Estrategia de caché

`LocationCache` es una caché tipada y en memoria que sólo almacena `GeocodingResult`. Su TTL predeterminado es 300 000 ms (cinco minutos), puede configurarse y usa un reloj inyectable para pruebas deterministas. Un TTL no finito, igual a cero o negativo se rechaza con `RangeError`, en lugar de crear entradas que nunca expiren o desactivar silenciosamente la caché.

La clave se normaliza con `query.trim().toLowerCase().replace(/\s+/g, ' ')`. Una entrada vence cuando su edad alcanza el TTL (`edad >= TTL`) y se elimina al consultarla. La caché copia el resultado tanto al almacenarlo como al devolverlo, de modo que una mutación del consumidor no modifica la entrada guardada.

El adaptador consulta primero la caché y sólo almacena respuestas que superaron toda la validación. Timeout, 429, otros errores HTTP, desconexión, JSON inválido y respuestas incompletas o inválidas producen `null` y no se almacenan; una llamada posterior vuelve a consultar HTTP.

## 4. Ubicación manual

`CrearIncidencia` contiene un campo textual para capturar edificio, zona o referencia manual. Sin embargo, la navegación hacia esa pantalla y su composición con `GeoCodingAdapter` no están integradas en el consumidor real de `App.tsx`; por ello no se afirma que exista un flujo de fallback ejecutado de extremo a extremo.

Cuando se implemente esa composición, el consumidor deberá pasar el resultado de `geocode` —un resultado válido o `null`— junto con la etiqueta manual a `selectIncidentLocation`. Esa función selecciona los datos válidos del proveedor o conserva la etiqueta manual sin agregar coordenadas ficticias.

## 5. Reglas de reintento y decisión de fallo

`planRetry` permite planificar un reintento después de los fallos numerados 1, 2 y 3, y se detiene cuando `attempt >= 4`. Interpretado desde la primera solicitud como intento 1, esto limita la operación a un máximo de cuatro solicitudes totales. Para POST exige una clave de idempotencia estable y contempla `Retry-After` para 429; también calcula demoras progresivas finitas.

`GeoCodingAdapter` no ejecuta `planRetry`, no espera entre intentos y no contiene un bucle de reintento. Ante cualquier fallo devuelve `null` para que el consumidor pueda continuar con ubicación manual. Además, aunque `planRetry` acepta `retryAfterMs`, el error HTTP actual de `CourseHttpClient` no expone el encabezado `Retry-After` a un ejecutor general. Por tanto, el repositorio contiene planificación de esa regla, pero no un flujo general que lea ese encabezado y efectúe automáticamente la espera y el reintento.
