# Modelo de Datos — CampusOps EQ-11 · Semana 08

## Versión de esquema
- **Versión actual:** `2`
- **Clave en AsyncStorage:** `campusops:schema_version`
- **Tipo:** entero

## Entidades y almacenamiento

| Entidad | Clave / Almacenamiento | Descripción |
|---|---|---|
| Incidencias en caché | `campusops:incidents` (AsyncStorage) | Lista de `IncidentDTO` cacheadas para uso offline. |
| Cola offline | `campusops:offline_queue` (AsyncStorage) | Lista de `PendingOperation[]` generadas mientras no hay conexión. |
| Versión de esquema | `campusops:schema_version` (AsyncStorage) | Controla la migración entre versiones del esquema (`v1` → `v2`). |
| Tokens de sesión | `session_token` / `refresh_token` (SecureStore) | **Nunca** se guardan en AsyncStorage. Se gestionan vía `expo-secure-store`. |

## Estructura de PendingOperation (cola)

```typescript
interface PendingOperation {
  operationId: string;   // UUID estable — NO cambia aunque se reintente
  incidentId: string;    // ej: 'campus-inc-001' (referencia a Incident.id)
  actorId: string;       // ej: 'technician-1' | 'coordinator-1' | 'reporter-1'
  baseVersion: number;   // versión del registro cuando se generó la operación
  action: string;        // 'start' | 'resolve' | 'add_note' | 'add_photo_ref'
  payload: Record<string, unknown>;
  createdAt: string;     // ISO 8601
}
```

**Reglas clave:**
- `operationId` es **estable e idempotente**. Reutilizarlo con contenido distinto debe tratarse como error (409 en backend).
- La cola **persiste en AsyncStorage** y debe sobrevivir al reinicio de la app.
- Solo se retira una operación de la cola cuando el **servidor confirma** (HTTP 200/201). Errores o timeout **NO** la eliminan.

## Relaciones
- `PendingOperation.incidentId` → `Incident.id` (referencia, no FK estricta)
- `PendingOperation.actorId` → perfil autorizado según políticas de semana 06
- `baseVersion` vincula la operación con la versión del registro sobre la que se generó (fundamental para `resolveSync`)

## Procedimiento de migración v1 → v2

1. **Leer versión actual**: Obtener `schema_version` de AsyncStorage. Si no existe, se considera `0` o `1` según estado previo.
2. **Verificar**: Si ya es igual a la versión objetivo, no se ejecuta migración.
3. **Tomar snapshot completo**: Guardar `incidents`, `queue` y `schema_version` (valores crudos tal como están).
4. **Aplicar migración**: Ejecutar los pasos de migración. Ejemplo v1→v2: añadir campo `category` a incidencias que no lo tengan con valor por defecto `maintenance`.
5. **Validar y guardar**: Si todos los pasos son exitosos, actualizar incidencias migradas y establecer `schema_version = 2`.
6. **Rollback en caso de falla**: Si cualquier paso lanza error, **restaurar el snapshot completo**. Se restauran `incidents`, `queue` y `schema_version` exactamente como estaban. Si `schema_version` no existía antes, se elimina con `removeItem`. **Nunca** debe quedar un estado parcial mezclado entre v1 y v2.

## Recuperación ante falla (demostrado con pruebas)

| Estado | Descripción |
|---|---|
| **ANTES** | `schema_version = 1`. Incidencias y cola en su estado original (v1). |
| **DURANTE** | Se inyecta un fallo (`injectFail = true`) en un paso intermedio de la migración. |
| **DESPUÉS (rollback)** | `schema_version = 1`. Incidencias y cola **idénticas** al estado ANTES. Sin incidencias con esquema v2 mezcladas con v1. Función retorna `'rolled_back'`. |

## Sincronización y conflictos (referencia)
La resolución de conflictos se detalla en [`docs/sync-policy.md`](./sync-policy.md). `resolveSync` opera a nivel de campo con comparación JSON canónica. El campo `work` es compuesto (`{ assignedTechnicianId, status }`), por lo que reasignación remota + inicio local offline constituyen un **conflicto**. 
