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

## Creación e idempotencia

### Entrada y validación previa al envío

La entrada de creación es `NewIncidentInput = { category, description, location }` (`src/domain/models/NewIncident.ts`). `validateNewIncident` se ejecuta antes de cualquier solicitud:

- `category` debe ser una de las siete categorías publicadas; ausente produce `required` y un valor desconocido `invalid_category`;
- `description` y `location` deben ser texto con caracteres distintos de espacios (`required` en caso contrario);
- los textos se recortan, de modo que `"  agua "` y `"agua"` son la misma operación;
- se informan todos los campos inválidos a la vez.

La validación del cliente evita solicitudes inútiles, pero no sustituye al servidor: éste sigue siendo la frontera autoritativa y puede responder `422`. No se inventan límites de longitud que el contrato no publica.

### Puerto y resultados

`IIncidenciaRepository.create(input, idempotencyKey)` devuelve una unión discriminada. La clave la decide el caso de uso (`CreateIncidencia`); ni el repositorio ni el transporte la regeneran entre intentos.

| Resultado | Significado |
|---|---|
| `{ ok: true, kind: 'created' }` | `201` y `duplicate: false`: primera ejecución. |
| `{ ok: true, kind: 'replayed' }` | `200` y `duplicate: true`: misma clave y contenido; misma incidencia. |
| `error.kind: 'idempotency_conflict'` | `409`: la clave se usó con otro contenido. No guarda nada. |
| `error.kind: 'http'` | `403` rol incompatible, `422` entrada rechazada, `400` clave ausente/corta, `500` falla del servidor; conservan `status` y `code`. |
| `error.kind: 'uncertain'` | `timeout`, `network` o JSON ilegible en una escritura: **resultado desconocido**. |
| `error.kind: 'contract'` | La respuesta no cumple el contrato (ver abajo). |
| `error.kind: 'validation'` / `'busy'` | Los produce el caso de uso: entrada inválida o envío distinto en curso. |

### Validación de la respuesta de creación

`interpretCreateResponse` (`src/infrastructure/api/incidentCreation.ts`) exige:

1. estado `200` o `201` (cualquier otro `2xx` es `unexpected_status`);
2. objeto con `operationId` de texto no vacío y `duplicate` booleano (`creation_envelope`);
3. coherencia: `201` sólo con `duplicate: false` y `200` sólo con `duplicate: true`;
4. `incident` válido según el mismo parser y mapper de las consultas: sobre inválido (`resource_contract`), estado fuera del dominio (`incident_status`) o payload inválido (`incident_payload`); un `payload: null` **no** se acepta como incidencia creada;
5. `operationId` igual a la clave enviada (`operation_mismatch` si pertenece a otra operación).

### Ciclo de vida de la clave

| Situación | Clave |
|---|---|
| Operación nueva (contenido distinto del pendiente) | Se genera una clave nueva. |
| Reintento con el mismo contenido tras resultado incierto | Se **conserva** la clave. |
| Éxito `201` o replay `200` | Se descarta; el siguiente envío es otra operación. |
| Rechazo definitivo (`400`, `403`, `422`, `409`, otros `4xx`) | Se descarta: no se confirmó nada. |
| `timeout`, red, JSON ilegible, `500`/`5xx`, `408`, `429`, respuesta inválida | Se **conserva**: pudo haberse confirmado en el servidor. |

Un timeout no confirma que el servidor rechazara la creación: el simulador, en `timeout_after_commit`, guarda la incidencia y responde después de que el cliente abandonó la espera. Por eso el resultado se representa como `uncertain` y la reconciliación consiste en reintentar con la misma clave; el servidor responde `200` con la misma incidencia y no duplica el historial.

El caso de uso comparte la solicitud en curso entre envíos idénticos simultáneos y rechaza con `busy` un envío distinto mientras otro está en curso. La clave vive en memoria durante el ciclo de reintento; no se persiste tras reiniciar la aplicación porque los materiales no lo exigen como requisito confirmado.

### Formulario

`CrearIncidencia` (`src/ui/screens/CrearIncidencia.tsx`) presenta estados de envío, éxito y error, y no llama HTTP ni importa infraestructura. Tras un resultado incierto bloquea el contenido (editarlo sería otra operación y podría duplicar una incidencia ya guardada) y ofrece **Reintentar envío** (misma clave) o **Descartar envío** (operación nueva). El botón se deshabilita mientras hay un envío en curso y una guarda impide dobles envíos. Los mensajes son de presentación y no forman parte del DTO.

Interfaz para integrar en `App.tsx`: `<CrearIncidencia repository onCreated={(id) => ...} onCancel={() => ...} />`; `onCreated` se invoca sólo tras un `201` o `200` confirmados.

### Logs

El transporte registra únicamente método, ruta (`/v1/incidents`), tipo de error, status y código técnico. La `Idempotency-Key`, la descripción, la ubicación y los cuerpos no se registran.

## Estado de implementación — creación

Implementado:

- entrada y validación previa al envío;
- `create` en el puerto, en `IncidenciaApiRepository` y en el repositorio en memoria (con la misma semántica de replay y conflicto);
- generación y reutilización de la clave de idempotencia en el caso de uso;
- distinción entre `201`, replay `200`, `409`, `403`, `422`, `500` y resultado incierto;
- formulario con prevención de envío simultáneo.

Los resultados de pruebas se registran en `reports/week-05/contract-tests.json` y `failure-matrix.json` únicamente después de ejecutarlas; este documento no declara resultados.
