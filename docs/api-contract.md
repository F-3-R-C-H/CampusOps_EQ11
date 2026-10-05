# Contrato de API de incidencias — Semana 05

Este documento describe el contrato observado en `docs/CAMPUSOPS_API.md` y en el backend didáctico de `course-backend/`. Los actores, tokens y datos indicados son fixtures públicos y sintéticos; no representan autenticación de producción.

## Configuración y headers

- Backend local: `http://127.0.0.1:4310`.
- Emulador Android: `http://10.0.2.2:4310`.
- Dispositivo físico: configurar `EXPO_PUBLIC_COURSE_BACKEND_URL` con la IP autorizada de la computadora en la red de laboratorio; `localhost` dentro del teléfono no apunta a la computadora.
- Actor configurable: `EXPO_PUBLIC_COURSE_ACTOR` (por defecto `reporter-1`). Escenario opcional: `EXPO_PUBLIC_COURSE_SCENARIO`.
- Las rutas de incidencias requieren `Authorization: Bearer course-valid-token` y `X-Course-Actor`.
- Los actores publicados son `reporter-1`, `reporter-2`, `technician-1`, `technician-2` y `coordinator-1`.
- `X-Course-Scenario` permite seleccionar respuestas deterministas como `success`, `nullable`, `malformed`, `server_error`, `rate_limited`, `slow` y `timeout_after_commit`.
- Las escrituras JSON usan `Content-Type: application/json` y una `Idempotency-Key` estable de al menos ocho caracteres.

## Solicitudes y respuestas

### Lista: `GET /v1/incidents`

No envía cuerpo. Devuelve `200` y un objeto `{ "items": [...] }`. Cada elemento es un recurso remoto con esta forma:

```json
{
  "id": "campus-inc-001",
  "version": 1,
  "status": "assigned",
  "payload": {
    "category": "connectivity",
    "description": "Sin conexión en laboratorio ficticio",
    "location": "Edificio de prueba A",
    "reporterId": "reporter-1",
    "assignedTechnicianId": "technician-1",
    "priority": "medium",
    "notes": [],
    "evidence": [],
    "history": []
  }
}
```

La lista se filtra en el servidor: un reportante ve sus reportes, un técnico sus asignaciones y un coordinador todos. Una lista visible sin elementos es `{ "items": [] }`.

### Detalle: `GET /v1/incidents/:id`

No envía cuerpo. Devuelve directamente un recurso remoto. Los resultados publicados incluyen `200`, `401` para credenciales/actor inválidos, `403` para una incidencia no visible, `404` si el ID no existe y `500` en el escenario controlado.

### Creación: `POST /v1/incidents`

Sólo el rol reportante puede crear. El cuerpo es:

```json
{
  "category": "water",
  "description": "Fuga simulada",
  "location": "Zona manual ficticia"
}
```

Las categorías aceptadas son `electrical`, `laboratory`, `water`, `connectivity`, `equipment`, `safety` y `maintenance`. Categoría, descripción y ubicación son obligatorias; los dos textos deben contener caracteres distintos de espacios.

La primera ejecución devuelve `201`:

```json
{
  "incident": {
    "id": "campus-inc-101",
    "version": 1,
    "status": "open",
    "payload": {
      "category": "water",
      "description": "Fuga simulada",
      "location": "Zona manual ficticia",
      "reporterId": "reporter-1",
      "assignedTechnicianId": null,
      "priority": "medium",
      "notes": [],
      "evidence": [],
      "history": []
    }
  },
  "operationId": "create-operation",
  "duplicate": false
}
```

Repetir el mismo contenido con la misma `Idempotency-Key` devuelve `200`, la misma incidencia y `duplicate: true`. Reutilizar la clave con contenido diferente devuelve `409`. También están publicados `400` por clave ausente o corta, `403` por rol incompatible y `422` por entrada inválida.

## Límites entre representaciones

### DTO remoto

`RemoteResource` representa exclusivamente el sobre recibido:

```ts
type RemoteResource = {
  id: string;
  version: number;
  status: string;
  payload: Record<string, unknown> | null;
};
```

`IncidentPayloadDto` representa los campos del payload que realmente emite el backend. Son obligatorios `category`, `description`, `location`, `reporterId`, `assignedTechnicianId`, `priority`, `notes`, `evidence` e `history`. `assignedTechnicianId` admite `null`; `diagnosis` es opcional porque sólo aparece después de una resolución. Se ignoran campos adicionales para permitir evolución compatible.

### Modelo de aplicación

`Incidencia` contiene datos ya validados y usa uniones cerradas para categoría, estado y prioridad. El mapper no entrega valores `unknown` al resto de la aplicación. Los campos `title` y `createdAt` que ya utilizaba el repositorio en memoria se conservan únicamente como metadatos locales opcionales para compatibilidad; no forman parte del DTO publicado y el mapper remoto nunca los inventa. La UI puede usar descripción como etiqueta visible y sólo presenta fecha cuando una fuente real la proporciona.

### Presentación

Etiquetas traducidas, iconos, colores, mensajes y estados como `loading`, `empty` o `error` pertenecen a la UI. No deben agregarse al DTO ni interpretarse como datos enviados por el servidor.

## Validación implementada

`parseRemoteResource` valida en ejecución:

- raíz objeto, excluyendo `null` y arreglos;
- `id` y `status` como textos no vacíos;
- `version` como entero no negativo;
- `payload` como objeto no arreglo o `null`;
- campos adicionales permitidos, pero no copiados al valor validado.

`parseIncidentPayload` valida:

- categoría y prioridad dentro de los valores emitidos por el backend;
- descripción, ubicación y actor reportante como textos no vacíos;
- técnico asignado como texto no vacío o `null`;
- notas, evidencias e historial como arreglos con la forma producida por el backend;
- diagnóstico, cuando existe, como texto no vacío.

`mapRemoteIncident` devuelve una unión discriminada:

- `kind: "incident"`: sobre y payload válidos, con una `Incidencia` utilizable;
- `kind: "absent"`: sobre válido con `payload: null`, conservando ID, versión y estado;
- `kind: "invalid"`: contrato del sobre, estado de dominio o payload inválido.

Un payload nulo no se convierte en una incidencia vacía, no usa valores predeterminados y no se confunde con datos corruptos.

## Transporte y errores implementados

`CourseHttpClient` concentra URL base, actor, escenario, headers, serialización JSON, timeout y cancelación. Su `fetch` es inyectable para pruebas deterministas. El timeout usa una carrera controlada que abarca tanto la obtención de la respuesta como la lectura completa del cuerpo y aborta la solicitud; una respuesta o rechazo posterior no cambia el resultado ya emitido. El timer siempre se limpia al finalizar, tanto en éxito como en fallas de red, JSON o HTTP.

El transporte devuelve resultados discriminados y no deja rechazos al consumidor:

- `timeout`: venció el plazo configurado;
- `network`: `fetch` fue rechazado;
- `invalid_json`: una respuesta HTTP exitosa no pudo parsearse como JSON;
- `http`: respuesta no exitosa con `status` y, cuando cumple el formato técnico publicado, `code`.

El repositorio añade `contract` para contenedor de lista o incidencia inválidos. Un `500` permanece como error HTTP y no se presenta como payload inválido. `403` y `404` conservan su status para que la UI muestre mensajes distintos.

Los logs usan `secureLogger` y contienen solamente método, ruta, tipo de error, status y código técnico controlado. No registran autorización, actor, cuerpo solicitado, cuerpo remoto ni mensajes de excepciones.

La interfaz genérica del transporte admite cuerpo JSON y headers adicionales proporcionados por el llamador. Esto permite que el futuro bloque de creación entregue una `Idempotency-Key` estable, pero este bloque no genera claves ni implementa el POST.

## Política de consultas

`IncidenciaApiRepository` implementa lista y detalle fuera de las pantallas y usa `mapRemoteIncident`:

- `{ items: [] }` produce `kind: "empty"`;
- items utilizables producen `kind: "data"`;
- un recurso válido con `payload: null` conserva `{ id, version, status }` en `unavailable`;
- si todos los items carecen de payload, la lista produce `kind: "payload_absent"`;
- una lista mixta muestra incidencias utilizables y conserva el conteo/metadatos no disponibles;
- un contenedor o cualquier item corrupto invalida la consulta completa; nunca se convierte en lista vacía;
- el detalle con payload nulo produce `kind: "payload_absent"` y no fabrica una `Incidencia`.

Lista y detalle presentan carga, éxito, vacío/payload ausente, error y reintento. Cada efecto identifica la solicitud activa, por lo que una respuesta obsoleta o de un componente desmontado no reemplaza el estado vigente. Las pantallas no llaman `fetch`.

La composición de `App` acepta el puerto de repositorio por inyección. La aplicación usa por defecto `IncidenciaApiRepository`; las pruebas smoke y de pantallas proporcionan repositorios deterministas, por lo que no necesitan un backend ni realizan HTTP real.

## Estado de implementación

Implementado en este bloque:

- validación del sobre remoto;
- validación del payload de incidencia;
- mapeo DTO a modelo de aplicación;
- representación explícita de payload ausente;
- pruebas deterministas sin red.
- transporte HTTP inyectable con timeout, cancelación y errores discriminados;
- consultas de lista y detalle mediante repositorio API;
- validación del contenedor de lista y política explícita de payload ausente;
- estados de carga, éxito, vacío, error y reintento en lista y detalle;
- composición de la aplicación con el repositorio API y configuración de URL por entorno.

Pendiente para los otros bloques de semana 05:

- formulario y comando de creación;
- generación/reutilización de claves de idempotencia;
- reconciliación de escrituras que puedan terminar en timeout posterior al commit.
