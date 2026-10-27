# 📋 PLAN ESTRATÉGICO SEMANA 08 — CampusOps EQ-11
## "Persistencia, Migración y Sincronización con Conflicto"

**Proyecto:** CampusOps_EQ11 · React Native + Expo + TypeScript
**Materia:** Desarrollo Móvil Integral (DMI)
**Semana:** 08 · Puntos: **8 pts actividad + 3 pts quiz individual**
**Equipo EQ-11:**
| Integrante | Matrícula | Rama Git |
|---|---|---|
| **Fernando** (TÚ) | `3523110683` | `feature/fernando-week08-resolve-dedup` |
| **Tonantzin** | `3523110858` | `feature/tonantzin-week08-queue-persistence` |
| **Danna** | `3523110097` | `feature/danna-week08-datamodel-migration` |

> ✅ **Archivos del profesor analizados:** ACTIVITY_STUDENT_FACING.md · CAMPUSOPS.md · CAMPUSOPS_API.md · RUBRIC_PUBLIC.md · STARTER_AND_REPOSITORY.md · week-08.md · week-08-rubric.md · week-08-repository.md · week-08.test.ts

---

## ⚡ EL CASO DE ESTA SEMANA (del CAMPUSOPS.md oficial)

El **técnico-1** inicia atención en la incidencia `campus-inc-001` **sin conexión** (la cambia de `assigned` → `in_progress`).
Mientras tanto, **coordinator-1** reasigna esa incidencia a **técnico-2** en el servidor (versión 2).
Al reconectar → **conflicto detectado en el campo `work`** → NO se sobrescribe ninguna de las dos intenciones.

**Actores ficticios del contrato público (CAMPUSOPS_API.md):**
- `reporter-1`, `reporter-2` — crean incidencias
- `technician-1`, `technician-2` — atienden incidencias
- `coordinator-1` — asigna, reasigna, cierra
- Incidencia base: `campus-inc-001` (asignada a `technician-1`, versión 1)

---

## 📊 RÚBRICA OFICIAL (RUBRIC_PUBLIC.md)

| Criterio | Puntos | Tipo | Lo que se evalúa |
|---|:---:|:---:|---|
| **AC-01** Reproducción | 2.5 | Auto | SHA instala y pasa `make verify-week-08` |
| **AC-02** Comportamiento | 2.0 | Auto | Migración + cola persistente + sync + reinicio sin pérdida |
| **AC-03** Falla | 1.5 | Auto | Transacción fallida NO deja estado parcialmente migrado |
| **AC-04** Decisión técnica | 1.5 | Semi | `engineering.json`: política de conflicto e idempotencia justificada |
| **AC-05** Aportación individual | 0.5 | Semi | `individual.json` verificable por cada integrante |

**Gates que limitan calificación:**
- 🚨 **G1** Sin SHA/reproducción → automático = 0, máx **4.8/8**
- 🚨 **G2** Sin flujo central → máx **4.8/8**
- 🚨 **G3** Secreto/dato real expuesto → máx **4.8/8** + revocación
- 🚨 **G4** Sin evidencia individual → AC-05=0, máx **5.6/8**

---

## 🎯 PRUEBAS PÚBLICAS EXACTAS (week-08.test.ts)

```typescript
// TEST 1 — Conflicto offline vs reasignación remota (el caso del técnico)
// base:   campus-inc-001 v1 · work = { technician-1, assigned }
// local:  técnico inicia offline  → work = { technician-1, in_progress }
// remote: coordinador reasigna    → work = { technician-2, assigned } · v2
// RESULTADO ESPERADO: { kind: 'conflict', fields: ['work'] }
// ⚠️ Los objetos base/local/remote NO deben mutarse

// TEST 2 — Combinar campos independientes
// local cambia title, remote cambia priority → { kind: 'merged', fields: { title:'Local', priority:2 } }
// local cambia title, remote también cambia title → { kind: 'conflict', fields: ['title'] }
// ⚠️ Campos conflictivos en ORDEN ALFABÉTICO

// TEST 3 — Deduplicación por operationId estable
// [{ operationId:'op-1' }, { operationId:'op-1' }, { operationId:'op-2' }]
// → [op-1-primera, op-2] ← conserva primera, no muta entradas
```

---

## 📁 ENTREGABLES REQUERIDOS (ACTIVITY_STUDENT_FACING.md)

| Archivo | Contenido obligatorio |
|---|---|
| `docs/data-model.md` | Entidades, relaciones, almacenamiento, versión esquema, estructura cola, migración/recuperación |
| `docs/sync-policy.md` | Reglas combinar/conflicto, autorización, identidad estable, reintento, cuándo retirar de la cola |
| `reports/week-08/migration-tests.json` | Pruebas: migración correcta/fallida, rollback, reinicio, conflicto, combinación, deduplicación |
| `evidence/week-08/engineering.json` | `commitSha`, `decision`, ≥2 `alternatives`, `tradeoff`, `requirementIds`, `verification` |
| `evidence/week-08/individual.json` | `schemaVersion:1`, `week:8`, `teamId:"EQ11"`, 3 `members` completos |

---

## ═══════════════════════════════════════════════════════
## 👦 BLOQUE FERNANDO (TÚ) — Matrícula `3523110683`
## ═══════════════════════════════════════════════════════
**Rama:** `feature/fernando-week08-resolve-dedup`
**Criterio principal:** AC-02 (las pruebas públicas dependen de ti)
**Responsabilidad:** Implementar `resolveSync` y `deduplicateOperations` + `engineering.json`

### ¿Qué hará Fernando?
Implementarás las **2 funciones evaluadas automáticamente** por el profesor.
`resolveSync` detecta si la versión offline del técnico choca con la versión remota del servidor (conflicto)
o si se pueden combinar (merged). `deduplicateOperations` evita que el mismo cambio se aplique dos veces.

### Archivos que tocas:
1. `src/course-evaluation/index.ts` — reemplazar `pending()` con lógica real
2. `src/__tests__/resolveSync.test.ts` — pruebas propias adicionales
3. `src/__tests__/deduplicateOps.test.ts` — pruebas propias
4. `evidence/week-08/engineering.json` — decisión técnica (AC-04)

### 📐 CÓDIGO EXACTO para `resolveSync` (pegar en index.ts):

```typescript
export function resolveSync(
  base: SyncRecord,
  local: SyncRecord,
  remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  const conflictFields: string[] = [];
  const merged: JsonObject = {};

  // Reunir todos los campos de local y remote
  const allKeys = new Set([
    ...Object.keys(local.fields),
    ...Object.keys(remote.fields),
  ]);

  // IMPORTANTE: orden alfabético — el test verifica ['work'], ['title'] en ese orden
  for (const key of Array.from(allKeys).sort()) {
    // Comparar por contenido JSON (no por identidad de objeto — lo dice CAMPUSOPS_API.md)
    const baseVal   = JSON.stringify((base.fields   as JsonObject)[key] ?? null);
    const localVal  = JSON.stringify((local.fields  as JsonObject)[key] ?? null);
    const remoteVal = JSON.stringify((remote.fields as JsonObject)[key] ?? null);

    const localChanged  = localVal  !== baseVal;
    const remoteChanged = remoteVal !== baseVal;

    if (localChanged && remoteChanged) {
      // Mismo campo modificado por ambos → CONFLICTO
      conflictFields.push(key);
    } else if (localChanged) {
      merged[key] = (local.fields as JsonObject)[key];
    } else {
      // Remote cambió o nadie cambió → usar remote
      merged[key] = (remote.fields as JsonObject)[key];
    }
  }

  if (conflictFields.length > 0) {
    return { kind: 'conflict', fields: conflictFields };
  }
  return { kind: 'merged', fields: merged };
}
```

### 📐 CÓDIGO EXACTO para `deduplicateOperations` (pegar en index.ts):

```typescript
export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  _operations: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const op of _operations) {
    if (!seen.has(op.operationId)) {
      seen.add(op.operationId);
      result.push(op); // conserva la primera, sin mutar entradas
    }
  }
  return result;
}
```

### 📋 PASO A PASO COMPLETO DE FERNANDO:

**PASO 1 — Primero: aplicar el ZIP al repositorio (hazlo tú)**
```bash
# Desde la carpeta del repositorio CampusOps_EQ11:
# Copiar TODO el contenido del ZIP encima del repo (incluye .github oculta)
# Combinar carpetas, NO borrar nada del historial
git add .github course-tests docs INSTALL.md
git commit -m "chore(week-08): aplicar paquete semana 8"
git push origin main
```

**PASO 2 — Crear tu rama**
```bash
git checkout main
git pull origin main
git checkout -b feature/fernando-week08-resolve-dedup
```

**PASO 3 — Implementar en src/course-evaluation/index.ts**
Abrir el archivo. Buscar las líneas:
  `return pending('resolveSync');`
  `return pending('deduplicateOperations');`
Reemplazarlas con el código exacto de arriba.

**PASO 4 — Verificar que las pruebas públicas pasan**
```bash
npm test -- --ci --runInBand course-tests/public/week-08.test.ts
```
→ Deben pasar las 3 pruebas (conflicto campus-inc-001, merged/conflict title, dedup op-1)

**PASO 5 — Crear pruebas propias adicionales**
Crear `src/__tests__/resolveSync.test.ts` con casos extra:
- Sin cambios en ningún lado → merged con campos de remote
- Solo local cambia → merged con valor local
- Múltiples campos en conflicto → fields ordenados alfabéticamente

Crear `src/__tests__/deduplicateOps.test.ts` con:
- Lista vacía → lista vacía
- Sin duplicados → misma lista
- 3 duplicados del mismo ID → solo el primero

**PASO 6 — Redactar evidence/week-08/engineering.json**
```json
{
  "schemaVersion": 1,
  "week": 8,
  "teamId": "EQ11",
  "commitSha": "<SHA real del commit>",
  "decision": "Política de detección de conflictos campo por campo con comparación JSON serializada. Un campo se considera en conflicto cuando tanto la versión local como la remota difieren de la base. Campos independientes se combinan en merged. El campo 'work' de CampusOps agrupa assignedTechnicianId y status: si el técnico inicia offline y el coordinador reasigna, ambos modifican work, constituyendo un conflicto. No se descarta la cola al detectar conflicto.",
  "alternatives": [
    {
      "name": "Last-Write-Wins (última escritura gana)",
      "reason": "Descartado: silenciaría la intención del técnico offline o la reasignación del coordinador sin aviso"
    },
    {
      "name": "Merge por timestamp",
      "reason": "Descartado: no hay reloj confiable en modo offline; los timestamps del dispositivo pueden estar desfasados"
    }
  ],
  "tradeoff": {
    "benefit": "Detecta exactamente cuándo dos actores modificaron el mismo campo; preserva ambas intenciones para resolución explícita",
    "cost": "Requiere que el usuario (coordinador o técnico autorizado) resuelva el conflicto manualmente"
  },
  "requirementIds": ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05"],
  "verification": [
    {
      "command": "npm test -- --ci --runInBand course-tests/public/week-08.test.ts",
      "result": "PASS: 3 tests aprobados",
      "evidence": "Test 1: conflict work ✓ · Test 2: merged/conflict title ✓ · Test 3: dedup op-1 ✓"
    }
  ]
}
```

**PASO 7 — Correr todas las pruebas incluyendo semana 6**
```bash
# Verificar que semana 6 sigue pasando:
npm test -- --ci --runInBand course-tests/public/week-06.test.ts

# Todas las pruebas propias de semana 8:
npm test -- --ci --runInBand course-tests/public/week-08.test.ts src/__tests__/resolveSync.test.ts src/__tests__/deduplicateOps.test.ts
```

**PASO 8 — Commit y PR**
```bash
git add src/course-evaluation/index.ts \
        src/__tests__/resolveSync.test.ts \
        src/__tests__/deduplicateOps.test.ts \
        evidence/week-08/engineering.json
git commit -m "feat(week-08): implementar resolveSync y deduplicateOperations"
git push origin feature/fernando-week08-resolve-dedup
```
→ Abrir Pull Request en GitHub hacia `main`
→ Tonantzin o Danna aprueba el PR (branch protection activa — no puedes aprobarte tú mismo)

---

## ═══════════════════════════════════════════════════════
## 👧 BLOQUE TONANTZIN — Matrícula `3523110858`
## ═══════════════════════════════════════════════════════
**Rama:** `feature/tonantzin-week08-queue-persistence`
**Criterio principal:** AC-02 (cola persistente) + AC-04 (sync-policy.md)
**Responsabilidad:** Cola offline que sobrevive al reinicio + política de sincronización documentada

### ¿Qué hará Tonantzin?
Implementará la **cola de operaciones pendientes** que guarda en el teléfono los cambios que hizo el técnico sin
conexión. Si la app se cierra y se vuelve a abrir, la cola debe estar exactamente igual. También redactará
las reglas oficiales del equipo para cuándo combinar cambios y cuándo declarar conflicto.

### Archivos que toca Tonantzin:
1. `src/infrastructure/persistence/OfflineQueue.ts` — cola persistente con AsyncStorage
2. `src/__tests__/offlineQueue.test.ts` — pruebas de persistencia al reinicio
3. `docs/sync-policy.md` — política oficial de sincronización del equipo

### 📐 ESTRUCTURA de OfflineQueue.ts:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'campusops:offline_queue';

export interface PendingOperation {
  operationId: string;   // UUID estable — NO cambia aunque se reintente
  incidentId: string;    // ej: 'campus-inc-001'
  actorId: string;       // ej: 'technician-1'
  baseVersion: number;   // versión del registro cuando se generó la operación
  action: string;        // 'start' | 'add_note' | 'add_photo_ref' | 'resolve'
  payload: Record<string, unknown>;
  createdAt: string;     // ISO 8601
}

export const OfflineQueue = {
  async enqueue(op: PendingOperation): Promise<void> {
    const current = await this.getAll();
    // No duplicar operationId ya existente
    if (current.some(o => o.operationId === op.operationId)) return;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...current, op]));
  },
  async getAll(): Promise<PendingOperation[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingOperation[];
  },
  async remove(operationId: string): Promise<void> {
    const current = await this.getAll();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(current.filter(o => o.operationId !== operationId)));
  },
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  },
};
```

### 📐 CONTENIDO de docs/sync-policy.md:

El archivo debe responder estas preguntas (basado en CAMPUSOPS_API.md y CAMPUSOPS.md):
1. **Regla de combinación campo por campo:** solo-local→local, solo-remote→remote, ambos→conflicto
2. **Campo `work` es compuesto:** `{ assignedTechnicianId, status }` — reasignación + inicio local = conflicto
3. **Autorización heredada de semana 6:** técnico no puede `close`; coordinator puede reasignar; reporter no puede `assign`
4. **Identidad estable:** `operationId` NO cambia en reintentos; reutilizar con otro contenido = error (409 en servidor)
5. **Cuándo retirar de la cola:** SOLO cuando el servidor confirma (HTTP 200/201). Error o timeout = mantener en cola
6. **Cómo se informa el conflicto:** la app muestra ambas versiones (local pendiente + remota actual) y bloquea sync hasta resolución
7. **Vinculación con prueba:** `npm test -- --ci --runInBand course-tests/public/week-08.test.ts` Test 1 demuestra detección

### 📋 PASO A PASO COMPLETO DE TONANTZIN:

**PASO 1 — Actualizar main y crear rama**
```bash
git checkout main
git pull origin main
git checkout -b feature/tonantzin-week08-queue-persistence
```

**PASO 2 — Verificar que AsyncStorage está instalado**
```bash
# En la terminal, dentro del repositorio:
grep "async-storage" package.json
# Si NO aparece:
npx expo install @react-native-async-storage/async-storage
```

**PASO 3 — Crear src/infrastructure/persistence/OfflineQueue.ts**
Usar la estructura del código de arriba. Guardar con el actor ficticio correcto.
Ejemplo de operación para las pruebas (usando actores del contrato público):
```typescript
const op: PendingOperation = {
  operationId: 'op-start-001',
  incidentId: 'campus-inc-001',
  actorId: 'technician-1',
  baseVersion: 1,
  action: 'start',
  payload: { note: 'Iniciando revisión eléctrica sector B' },
  createdAt: new Date().toISOString(),
};
```

**PASO 4 — Crear src/__tests__/offlineQueue.test.ts**
Casos que debe cubrir:
- `enqueue` → `getAll` → devuelve la misma operación
- `enqueue` duplicado (mismo operationId) → no se agrega dos veces
- `remove(operationId)` → elimina solo esa operación
- Simular reinicio: `clear` de caché de Jest + `getAll` → cola intacta (usando mock de AsyncStorage)
- Una referencia de foto (`add_photo_ref`) permanece en cola hasta confirmación del servidor

```bash
npm test -- --ci --runInBand src/__tests__/offlineQueue.test.ts
```

**PASO 5 — Redactar docs/sync-policy.md**
Ver contenido descrito arriba. Debe vincular cada regla con al menos una prueba ejecutable.

**PASO 6 — Commit y PR**
```bash
git add src/infrastructure/persistence/OfflineQueue.ts \
        src/__tests__/offlineQueue.test.ts \
        docs/sync-policy.md
git commit -m "feat(week-08): cola persistente offline y politica de sincronizacion"
git push origin feature/tonantzin-week08-queue-persistence
```
→ Abrir Pull Request hacia `main`
→ Fernando o Danna debe aprobar (no puede aprobarse a sí misma)

---

## ═══════════════════════════════════════════════════════
## 👧 BLOQUE DANNA — Matrícula `3523110097`
## ═══════════════════════════════════════════════════════
**Rama:** `feature/danna-week08-datamodel-migration`
**Criterio principal:** AC-03 (falla controlada) + documentación del modelo
**Responsabilidad:** data-model.md + MigrationManager + rollback + migration-tests.json + individual.json final

### ¿Qué hará Danna?
Definirá qué datos guarda la app y dónde (modelo de datos), implementará la migración de versión de esquema
y demostrará con pruebas que si algo falla durante la migración, el sistema vuelve al estado anterior
limpio — sin datos mezclados entre el esquema viejo y el nuevo. Al final consolida el individual.json
con los datos reales de los 3.

### Archivos que toca Danna:
1. `docs/data-model.md` — modelo completo de datos
2. `src/infrastructure/persistence/MigrationManager.ts` — migración + rollback
3. `src/__tests__/migrationManager.test.ts` — casos de migración correcta, falla y rollback
4. `reports/week-08/migration-tests.json` — índice de TODAS las pruebas del equipo
5. `evidence/week-08/individual.json` — consolidado final (los 3 integrantes)

### 📐 CONTENIDO de docs/data-model.md:

```markdown
# Modelo de Datos — CampusOps EQ-11 · Semana 08

## Versión de esquema: 2
Guardada en AsyncStorage con la clave: `campusops:schema_version`

## Entidades y almacenamiento

| Entidad | Clave AsyncStorage | Descripción |
|---|---|---|
| Incidencias en caché | `campusops:incidents` | Lista de IncidentDTO |
| Cola offline | `campusops:offline_queue` | PendingOperation[] |
| Versión de esquema | `campusops:schema_version` | número entero |
| Tokens de sesión | SecureStore: `session_token` / `refresh_token` | Nunca en AsyncStorage |

## Estructura de PendingOperation (cola)
operationId: string  ← UUID estable, NO cambia en reintentos
incidentId: string   ← referencia a Incident.id
actorId: string      ← 'technician-1' | 'coordinator-1' | etc.
baseVersion: number  ← versión del registro al crear la operación
action: string       ← 'start' | 'resolve' | 'add_note' | 'add_photo_ref'
payload: object      ← datos de la operación
createdAt: string    ← ISO 8601

## Relaciones
PendingOperation.incidentId → Incident.id (referencia, no FK estricta)
PendingOperation.actorId → perfil autorizado según semana 6

## Procedimiento de migración v1 → v2
1. Leer schema_version actual (0 o 1 si no existe)
2. Si igual a versión actual → sin migración
3. Tomar snapshot completo: incidents + queue + schema_version
4. Ejecutar pasos de migración (ej: añadir campo category a incidencias sin él)
5. Si falla cualquier paso → restaurar snapshot completo (rollback)
6. Si éxito → guardar nueva schema_version = 2

## Recuperación ante falla
- Estado ANTES: schema_version=1, datos v1 intactos
- DURANTE la falla: error inyectado en paso intermedio de migración
- Estado DESPUÉS de rollback: schema_version=1, datos exactamente iguales al estado ANTES
- Sin estado v2 parcial mezclado con v1
```

### 📐 API de MigrationManager.ts:

```typescript
// src/infrastructure/persistence/MigrationManager.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCHEMA_VERSION = 2;
const VERSION_KEY = 'campusops:schema_version';
const INCIDENTS_KEY = 'campusops:incidents';
const QUEUE_KEY = 'campusops:offline_queue';

export async function getCurrentSchemaVersion(): Promise<number> {
  const raw = await AsyncStorage.getItem(VERSION_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

export async function migrate(
  from: number,
  to: number,
  injectFail: boolean = false,
): Promise<'ok' | 'rolled_back'> {
  // 1. Tomar snapshot antes de migrar
  const snapshot = {
    incidents: await AsyncStorage.getItem(INCIDENTS_KEY),
    queue: await AsyncStorage.getItem(QUEUE_KEY),
    version: await AsyncStorage.getItem(VERSION_KEY),
  };

  try {
    // Paso de migración ejemplo: agregar campo 'category' a incidencias sin él
    const incidents = JSON.parse(snapshot.incidents || '[]');
    const migrated = incidents.map((inc: Record<string, unknown>) => ({
      ...inc,
      category: inc.category ?? 'maintenance', // valor por defecto
    }));

    if (injectFail) {
      throw new Error('Falla inyectada para prueba de rollback');
    }

    await AsyncStorage.setItem(INCIDENTS_KEY, JSON.stringify(migrated));
    await AsyncStorage.setItem(VERSION_KEY, String(to));
    return 'ok';
  } catch {
    // ROLLBACK: restaurar snapshot completo
    await AsyncStorage.setItem(INCIDENTS_KEY, snapshot.incidents ?? '[]');
    await AsyncStorage.setItem(QUEUE_KEY, snapshot.queue ?? '[]');
    if (snapshot.version !== null) {
      await AsyncStorage.setItem(VERSION_KEY, snapshot.version);
    } else {
      await AsyncStorage.removeItem(VERSION_KEY);
    }
    return 'rolled_back';
  }
}
```

### 📐 FORMATO de reports/week-08/migration-tests.json:
```json
{
  "schemaVersion": 1,
  "week": 8,
  "teamId": "EQ11",
  "commitSha": "<SHA real>",
  "generatedAt": "<ISO 8601 real>",
  "checks": [
    {
      "id": "MT-01",
      "status": "pass",
      "scenarioType": "nominal",
      "command": "npm test -- --ci --runInBand src/__tests__/migrationManager.test.ts",
      "evidence": "Migración v1→v2 exitosa: 3 incidencias conservadas, cola intacta, schema_version=2"
    },
    {
      "id": "MT-02",
      "status": "pass",
      "scenarioType": "failure",
      "command": "npm test -- --ci --runInBand src/__tests__/migrationManager.test.ts",
      "evidence": "Falla inyectada en paso 1/2: rolled_back retornado, schema_version=1, datos idénticos al estado previo"
    },
    {
      "id": "MT-03",
      "status": "pass",
      "scenarioType": "boundary",
      "command": "npm test -- --ci --runInBand src/__tests__/offlineQueue.test.ts",
      "evidence": "Cola recuperada tras reinicio simulado: 2 operaciones intactas incluyendo add_photo_ref"
    },
    {
      "id": "MT-04",
      "status": "pass",
      "scenarioType": "nominal",
      "command": "npm test -- --ci --runInBand course-tests/public/week-08.test.ts",
      "evidence": "resolveSync detecta conflicto en campo work (campus-inc-001) sin mutar entradas"
    },
    {
      "id": "MT-05",
      "status": "pass",
      "scenarioType": "nominal",
      "command": "npm test -- --ci --runInBand course-tests/public/week-08.test.ts",
      "evidence": "deduplicateOperations conserva primera op-1, descarta duplicado, conserva op-2"
    }
  ]
}
```

### 📋 PASO A PASO COMPLETO DE DANNA:

**PASO 1 — Actualizar main y crear rama**
```bash
git checkout main
git pull origin main
git checkout -b feature/danna-week08-datamodel-migration
```

**PASO 2 — Crear docs/data-model.md**
Usar el contenido descrito arriba. Verificar que incluye: entidades, dónde se guarda cada una,
versión de esquema, estructura de PendingOperation, relaciones y procedimiento de migración/recuperación.

**PASO 3 — Crear src/infrastructure/persistence/MigrationManager.ts**
Usar el código de arriba. Crear la carpeta `src/infrastructure/persistence/` si no existe.

**PASO 4 — Crear src/__tests__/migrationManager.test.ts**
Casos obligatorios:
- Caso 1 (nominal): `migrate(1, 2)` → 'ok', datos conservados, schema_version=2
- Caso 2 (failure): `migrate(1, 2, true)` → 'rolled_back', schema_version=1, datos idénticos al inicio
- Caso 3 (boundary): Ya en versión 2 → getCurrentSchemaVersion() === SCHEMA_VERSION → sin migración necesaria

```bash
npm test -- --ci --runInBand src/__tests__/migrationManager.test.ts
```

**PASO 5 — Crear reports/week-08/migration-tests.json**
⚠️ Con resultados REALES (comandos ejecutados y observaciones reales, no inventadas).
Incluir al menos 1 caso de falla (scenarioType: "failure") y al menos 1 boundary.

**PASO 6 — Consolidar evidence/week-08/individual.json (AL FINAL, cuando todos hayan mergeado)**
```json
{
  "schemaVersion": 1,
  "week": 8,
  "teamId": "EQ11",
  "members": [
    {
      "studentId": "3523110683",
      "commitShas": ["<SHA real del commit de Fernando>"],
      "files": ["src/course-evaluation/index.ts", "src/__tests__/resolveSync.test.ts", "src/__tests__/deduplicateOps.test.ts", "evidence/week-08/engineering.json"],
      "tests": ["course-tests/public/week-08.test.ts", "src/__tests__/resolveSync.test.ts", "src/__tests__/deduplicateOps.test.ts"],
      "reviews": [],
      "prediction": "resolveSync detectará el conflicto en campo work cuando technician-1 inicia offline y coordinator-1 reasigna remotamente. deduplicateOperations retornará solo la primera ocurrencia de cada operationId.",
      "command": "npm test -- --ci --runInBand course-tests/public/week-08.test.ts",
      "observedResult": "<RESULTADO REAL: PASS X suites, Y tests>",
      "explanation": "<EXPLICACIÓN REAL de Fernando sobre su implementación>"
    },
    {
      "studentId": "3523110858",
      "commitShas": ["<SHA real del commit de Tonantzin>"],
      "files": ["src/infrastructure/persistence/OfflineQueue.ts", "src/__tests__/offlineQueue.test.ts", "docs/sync-policy.md"],
      "tests": ["src/__tests__/offlineQueue.test.ts"],
      "reviews": [],
      "prediction": "La cola persistirá las operaciones de technician-1 tras reiniciar la app. enqueue con operationId duplicado no agrega segunda entrada.",
      "command": "npm test -- --ci --runInBand src/__tests__/offlineQueue.test.ts",
      "observedResult": "<RESULTADO REAL>",
      "explanation": "<EXPLICACIÓN REAL de Tonantzin>"
    },
    {
      "studentId": "3523110097",
      "commitShas": ["<SHA real del commit de Danna>"],
      "files": ["docs/data-model.md", "src/infrastructure/persistence/MigrationManager.ts", "src/__tests__/migrationManager.test.ts", "reports/week-08/migration-tests.json", "evidence/week-08/individual.json"],
      "tests": ["src/__tests__/migrationManager.test.ts"],
      "reviews": [],
      "prediction": "La migración v1→v2 conservará los datos existentes. Con falla inyectada, el rollback restaurará exactamente el estado anterior sin mezcla de esquemas.",
      "command": "npm test -- --ci --runInBand src/__tests__/migrationManager.test.ts",
      "observedResult": "<RESULTADO REAL>",
      "explanation": "<EXPLICACIÓN REAL de Danna>"
    }
  ]
}
```

**PASO 7 — Commit y PR**
```bash
git add docs/data-model.md \
        src/infrastructure/persistence/MigrationManager.ts \
        src/__tests__/migrationManager.test.ts \
        reports/week-08/migration-tests.json
git commit -m "feat(week-08): modelo de datos y migracion con rollback controlado"
git push origin feature/danna-week08-datamodel-migration
```
→ Abrir Pull Request hacia `main`
→ Fernando o Tonantzin debe aprobar

---

## 📝 TABLA RESUMEN DE ENTREGABLES

| Archivo | Quién lo hace | Revisores |
|---|:---:|:---:|
| `src/course-evaluation/index.ts` | **Fernando** | Tonantzin, Danna |
| `src/__tests__/resolveSync.test.ts` | **Fernando** | Tonantzin, Danna |
| `src/__tests__/deduplicateOps.test.ts` | **Fernando** | Tonantzin, Danna |
| `evidence/week-08/engineering.json` | **Fernando** | Tonantzin, Danna |
| `src/infrastructure/persistence/OfflineQueue.ts` | **Tonantzin** | Fernando, Danna |
| `src/__tests__/offlineQueue.test.ts` | **Tonantzin** | Fernando, Danna |
| `docs/sync-policy.md` | **Tonantzin** | Fernando, Danna |
| `docs/data-model.md` | **Danna** | Fernando, Tonantzin |
| `src/infrastructure/persistence/MigrationManager.ts` | **Danna** | Fernando, Tonantzin |
| `src/__tests__/migrationManager.test.ts` | **Danna** | Fernando, Tonantzin |
| `reports/week-08/migration-tests.json` | **Danna** | Todos aportan datos |
| `evidence/week-08/individual.json` | **Danna consolida** | Los 3 aportan |

---

## 🚀 FLUJO DE TRABAJO GIT (branch protection activa)

### ORDEN CRÍTICO DE PRs — Fernando primero porque AC-02 depende de él

```
┌─ PASO 0 ─────────────────────────────────────────────────────────────┐
│ Fernando: Copiar ZIP al repo y hacer commit en main                  │
│ git add .github course-tests docs INSTALL.md                         │
│ git commit -m "chore(week-08): aplicar paquete semana 8"             │
│ git push origin main                                                  │
└───────────────────────────────────────────────────────────────────────┘
       ↓ todos hacen: git checkout main && git pull origin main
┌─ TRABAJO PARALELO ───────────────────────────────────────────────────┐
│ Fernando: feature/fernando-week08-resolve-dedup                      │
│ Tonantzin: feature/tonantzin-week08-queue-persistence                │
│ Danna: feature/danna-week08-datamodel-migration                      │
└───────────────────────────────────────────────────────────────────────┘
       ↓ ORDEN DE PRs:
┌─ PR 1: Fernando → Tonantzin o Danna aprueba → merge ─────────────────┐
┌─ PR 2: Tonantzin rebasea → Fernando o Danna aprueba → merge ─────────┐
┌─ PR 3: Danna rebasea → Fernando o Tonantzin aprueba → merge ─────────┐

# Rebasear antes del PR:
git fetch origin
git rebase origin/main
git push origin <tu-rama> --force-with-lease
```

### VERIFICACIÓN OFICIAL (del STARTER_AND_REPOSITORY.md):
```bash
make feedback
make verify-week-08
make public-test-week-08
```

### COMMIT EXCLUSIVO DE EVIDENCIAS:
```bash
# Solo modificar reports/ y evidence/
git add reports/week-08/ evidence/week-08/
git commit -m "evidence: reportes y evidencias semana 08"
```

### ETIQUETA Y EVIDENCIA FINAL:
```bash
# ORDEN OBLIGATORIO (del repository.md):
git tag -a week-08-final -m "DMI week 08 final"
make evidence-week-08          # ← DESPUÉS de crear la etiqueta
git push origin HEAD
git push origin week-08-final
git rev-list -n 1 week-08-final   # ← este SHA va en Classroom
```

---

## 🧪 TABLA DE PRUEBAS

| Suite | Quién | Comando |
|---|:---:|---|
| `course-tests/public/week-08.test.ts` | **Fernando** | `npm test -- --ci --runInBand course-tests/public/week-08.test.ts` |
| `src/__tests__/resolveSync.test.ts` | **Fernando** | `npm test -- --ci --runInBand src/__tests__/resolveSync.test.ts` |
| `src/__tests__/deduplicateOps.test.ts` | **Fernando** | `npm test -- --ci --runInBand src/__tests__/deduplicateOps.test.ts` |
| `src/__tests__/offlineQueue.test.ts` | **Tonantzin** | `npm test -- --ci --runInBand src/__tests__/offlineQueue.test.ts` |
| `src/__tests__/migrationManager.test.ts` | **Danna** | `npm test -- --ci --runInBand src/__tests__/migrationManager.test.ts` |
| Semana 06 NO romper | **Todos** | `npm test -- --ci --runInBand course-tests/public/week-06.test.ts` |

---

## ⚠️ REGLAS CRÍTICAS DEL PROFESOR

- 🚫 NO reiniciar el proyecto (partir de semana 6 mismo repo)
- 🚫 NO usar solo memoria para la cola (AsyncStorage/expo-sqlite)
- 🚫 NO exponer tokens/credenciales en logs (mantener redactForTelemetry de semana 6)
- 🚫 NO sobrescribir asignación remota silenciosamente (detectar y reportar conflicto)
- 🚫 NO simular resultados de prueba (comandos y observaciones reales)
- 🚫 NO modificar pruebas para ocultar errores
- 🚫 NO usar datos reales (solo actores ficticios: reporter-1, technician-1, coordinator-1, campus-inc-001)
- ✅ Las pruebas de semana 6 deben seguir pasando
- ✅ operationId estable — reutilizar con contenido diferente = error (409 en backend)
- ✅ Solo retirar operación de cola cuando el servidor CONFIRMA (no por timeout)
- ✅ schemaVersion:1 y week:8 en todos los JSON de evidencia
- ✅ Se permite declarar uso de IA — justificar cómo verificaron el trabajo

---

