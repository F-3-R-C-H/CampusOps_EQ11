# Contrato de API de incidencias — Semana 05

Este documento describe el contrato observado en `docs/CAMPUSOPS_API.md` y en el backend didáctico de `course-backend/`. Los actores, tokens y datos indicados son fixtures públicos y sintéticos; no representan autenticación de producción.

## Configuración y headers

- Backend local: `http://127.0.0.1:4310`.
- Emulador Android: `http://10.0.2.2:4310`.
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

## Errores que deberá manejar el cliente HTTP

El transporte todavía pendiente deberá convertir fallas en resultados controlados y distinguibles: timeout/cancelación, desconexión, JSON sintácticamente inválido, contrato inválido y error HTTP con status. Un `500` no debe presentarse como payload inválido. Un timeout de escritura, especialmente con `timeout_after_commit`, no demuestra que el servidor no guardó la operación y no autoriza generar una nueva clave de idempotencia.

Los logs deberán usar el sanitizador existente y códigos técnicos estables; no deberán registrar autorización, ubicación, actores personales, cuerpos libres, evidencias o respuestas completas.

## Estado de implementación

Implementado en este bloque:

- validación del sobre remoto;
- validación del payload de incidencia;
- mapeo DTO a modelo de aplicación;
- representación explícita de payload ausente;
- pruebas deterministas sin red.

Pendiente para los otros bloques de semana 05:

- transporte HTTP y timeout;
- conexión de lista y detalle al backend;
- formulario y comando de creación;
- generación/reutilización de claves de idempotencia;
- estados de UI para errores cloud.
