# Política de sincronización — CampusOps EQ-11 · Semana 08

Reglas con las que la app combina, detecta conflictos y retira operaciones de la cola offline. Usa sólo actores y datos ficticios del contrato público (`technician-1`, `technician-2`, `coordinator-1`, `reporter-1`, `campus-inc-001`). Cada regla indica la prueba ejecutable que la respalda.

## 1. Qué se compara

Sincronizar es una comparación de tres versiones del mismo registro: **base** (la versión sobre la que el técnico trabajó, `baseVersion` de la operación), **local** (lo que cambió el técnico sin conexión) y **remota** (lo que hay hoy en el servidor). La comparación es campo por campo y por **contenido JSON**, no por identidad de objeto. Implementación: `resolveSync` en `src/course-evaluation/index.ts`.

## 2. Reglas de combinación y conflicto

| Situación del campo | Resultado |
|---|---|
| Sólo cambió el local | Se conserva el valor local |
| Sólo cambió el remoto | Se conserva el valor remoto |
| Cambiaron ambos y el resultado es distinto | **Conflicto**: no se elige ninguno |
| No cambió ninguno | Se conserva el valor remoto |

- Los campos en conflicto se reportan en **orden alfabético**.
- Si hay al menos un campo en conflicto, el registro completo se reporta como conflicto y no se aplica ninguna combinación parcial.
- Ninguna entrada (base, local, remota) se muta.

**Campo `work`.** Es compuesto: `{ assignedTechnicianId, status }`. Un inicio local (`assigned` → `in_progress`) y una reasignación remota (`technician-1` → `technician-2`) modifican ambos el mismo campo, así que son incompatibles aunque cambien propiedades distintas dentro de él.

*Pruebas:* `course-tests/public/week-08.test.ts` (caso `campus-inc-001` → `{ kind: 'conflict', fields: ['work'] }`; combinación `title`/`priority`; conflicto `title`) y `src/__tests__/resolveSync.test.ts`.

## 3. Qué se conserva, qué se combina y qué requiere resolución

- **Se conserva:** la intención local pendiente (la operación sigue en la cola) y la asignación remota actual. Ninguna se sobrescribe.
- **Se combina:** cambios en campos distintos desde la misma base.
- **Requiere resolución:** cualquier campo en conflicto. Mientras no se resuelva, la operación queda marcada `conflict` (`OfflineQueue.markConflict`), se excluye del envío (`getSendable`) y sigue guardada tras reiniciar la app.

*Pruebas:* `src/__tests__/offlineQueue.test.ts` → «un conflicto conserva la operación, ordena los campos y la excluye del envío».

## 4. Autorización (heredada de la semana 6)

La cola no concede permisos: cada operación se valida con la matriz de `src/domain/security/CampusOpsAuthorization.ts` y, de forma definitiva, con el servidor (`403 forbidden`).

| Perfil | Acciones permitidas |
|---|---|
| Reportante | `create`, `comment`, `add_evidence` |
| Técnico | `comment`, `add_evidence`, `start`, `resolve` (no `close`, no `assign`) |
| Coordinador | `comment`, `add_evidence`, `assign`, `prioritize`, `close`, `reopen` |

- Un técnico no modifica una incidencia que fue reasignada a otra persona: si la reasignación remota ya le quitó la incidencia, su operación `start` queda en conflicto y no se envía como si nada.
- Un rechazo `403` no es un conflicto ni una confirmación: la operación no se retira automáticamente; se informa al usuario.
- El rol nunca se toma de la operación guardada: se toma de la sesión vigente.

*Pruebas:* `src/__tests__/campusOpsAuthorization.test.ts`; `course-tests/public/week-06.test.ts`.

## 5. Identidad estable de operación

- Cada operación tiene un `operationId` que se genera una sola vez y **no cambia en reintentos**. También conserva `incidentId`, `actorId`, `baseVersion`, `action`, `payload` y `createdAt`.
- Ese mismo `operationId` viaja como `Idempotency-Key` al servidor.
- Reintentar = mismo `operationId` y mismo contenido: la cola no lo duplica (`enqueue` devuelve `'duplicate'`) y el servidor no repite el efecto.
- Reutilizar un `operationId` con contenido distinto es **error**: la cola lo rechaza (`operation_id_reused`) y el servidor responde `409 idempotency_key_reused`.
- Si la lista contiene repetidos (por ejemplo, tras un reintento), `deduplicateOperations` conserva la primera ocurrencia de cada `operationId` sin mutar la entrada.

*Pruebas:* `src/__tests__/offlineQueue.test.ts` («un reintento…no se agrega dos veces», «reutilizar un operationId con contenido distinto es error…»); `src/__tests__/deduplicateOps.test.ts`; `course-tests/public/week-08.test.ts` (deduplicación de `op-1`).

## 6. Cuándo se retira una operación de la cola

| Respuesta | Acción sobre la cola |
|---|---|
| `200` / `201` confirmados | **Retirar** (`OfflineQueue.remove`) |
| Timeout o respuesta perdida | **Mantener**: un timeout no prueba que el servidor no la ejecutó; se reintenta con el mismo `operationId` |
| `5xx`, `429`, sin conexión | **Mantener** y reintentar después con el mismo `operationId` |
| `409 version_conflict` | **Mantener** y marcar `conflict`; se vuelve a leer la versión remota y se aplica la sección 2 |
| `409 idempotency_key_reused` | **Mantener** y reportar como error de la app (indica un defecto, no un reintento válido) |
| `403 forbidden` | **Mantener** y avisar al usuario; no se descarta en silencio |

Una referencia de foto (`add_evidence` con `localUri`) identifica un recurso pendiente de subir, no una imagen ya cargada: permanece en la cola, con su identidad, hasta la confirmación del servidor.

*Pruebas:* `src/__tests__/offlineQueue.test.ts` («la referencia de foto permanece en la cola hasta que el servidor confirme», «reinicio simulado: la cola conserva identidad y contenido»).

## 7. Cómo se informa y se resuelve el conflicto

1. La app muestra ambas versiones: el cambio local pendiente (por ejemplo, «iniciar atención») y el estado remoto actual (por ejemplo, «reasignada a `technician-2`»).
2. La sincronización de esa operación queda bloqueada; el resto de operaciones sin conflicto puede enviarse.
3. La resolución la decide una persona con permiso sobre la acción (coordinador para reasignaciones; el técnico sólo sobre lo que aún le pertenece). Al resolver, se crea una operación nueva con otro `operationId` y la `baseVersion` actual; la operación en conflicto se retira sólo cuando esa decisión queda confirmada por el servidor.
4. Nunca se aplica «la última escritura gana» ni se descarta la cola para salir del conflicto.

## 8. Alcance de esta política y límites conocidos

- Esta política define reglas y el almacenamiento que las sostiene (`OfflineQueue`). Las funciones `resolveSync` y `deduplicateOperations` son puras; la prueba de persistencia real (reinicio) corresponde a `offlineQueue.test.ts`, que simula el reinicio descartando los módulos y conservando el almacenamiento.
- La pantalla de resolución de conflictos y el envío HTTP desde la cola no forman parte de esta entrega; la sección 7 describe el comportamiento esperado de esa interfaz.
- Las pruebas usan un doble en memoria de AsyncStorage; no se ejecutaron en un dispositivo.

## 9. Cómo comprobarlo

```bash
npm test -- --ci --runInBand course-tests/public/week-08.test.ts
npm test -- --ci --runInBand src/__tests__/offlineQueue.test.ts
npm test -- --ci --runInBand course-tests/public/week-06.test.ts
```
