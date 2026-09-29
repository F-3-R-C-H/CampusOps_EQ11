# Auditoría de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Dependencias con vulnerabilidades HIGH no bloqueadas por el CI | Medio/Alto | NO corregido — hallazgo pendiente | `docs/evidence/hallazgo-1-audit.txt` |
| 2 | .gitignore no ignoraba archivos .env.* sensibles | Medio | Corregido | `docs/evidence/hallazgo-2-gitignore.txt` |
| 3 | redactForTelemetry no estaba implementado | Medio | Corregido | `docs/evidence/hallazgo-3-redact-telemetry.txt` |

## Hallazgo 1 — Dependencias con vulnerabilidades HIGH no bloqueadas por el CI

### Problema encontrado
El script `audit:ci` de `package.json` se ejecuta como `npm audit --omit=dev --audit-level=critical`. El umbral está configurado únicamente en `critical`, por lo que las vulnerabilidades de severidad `high` presentes en el grafo de producción no hacen fallar el gate. La ejecución real de `npm audit --omit=dev --json` (2026-09-24) reporta 2 vulnerabilidades HIGH y 0 CRITICAL:

- `@xmldom/xmldom` (high, transitiva) — cadenas vía `@expo/cli -> @expo/plist` y `@expo/config-plugins -> xcode -> simple-plist -> plist`.
- `js-yaml` (high, transitiva) — cadenas vía `@expo/cli -> @expo/xcpretty` y `react-native -> @react-native/jest-preset -> babel-jest -> @istanbuljs/load-nyc-config`.

### Riesgo
Falta de visibilidad y de bloqueo sobre componentes con vulnerabilidades conocidas de severidad alta que forman parte del árbol de dependencias que llega al bundle de la aplicación. Sin mitigación, cualquier futuro parseo de datos no confiables por estas librerías podría ser explotable, y el pipeline no detecta esa condición.

### Solución / estado
IDENTIFICADO — NO CORREGIDO. Queda como hallazgo pendiente de corrección y NO como corrección aplicada. Se documenta aquí para su tratamiento posterior (subir el umbral del gate o eliminar/sobrescribir las dependencias afectadas con evidencia verificable), sin inventar una solución ya realizada.

### Evidencia
`docs/evidence/hallazgo-1-audit.txt` — salida real de `npm audit --omit=dev --json` (exit code 1, 2 HIGH / 0 CRITICAL) y script `audit:ci` actual.

## Hallazgo 2 — .gitignore no ignoraba archivos .env.* sensibles

### Problema encontrado
La regla `.env` del `.gitignore` solo coincidía con el archivo exactamente llamado `.env`. Archivos de entorno ampliados como `.env.local` o `.env.production` no quedaban ignorados y podían subirse accidentalmente al repositorio.

### Riesgo
Fuga de secretos: si un integrante o un flujo de build crea `.env.local`/`.env.production` con credenciales reales, el archivo no está protegido por el ignore y puede ser rastreado y publicado en el repositorio público.

### Solución
Se conservó la regla `.env` original y se agregaron dos patrones que cubren el resto de los archivos de entorno, excepto el ejemplo que debe permanecer rastreado.

### Antes
```gitignore
.env
```

### Después
```gitignore
.env
.env.*
!.env.example
```

### Evidencia
Comprobación real con `git check-ignore -v` (exit code 0 = ignorado):

- `.env` → `.gitignore:8:.env` — ignorado.
- `.env.local` → `.gitignore:9:.env.*` — ignorado.
- `.env.production` → `.gitignore:9:.env.*` — ignorado.
- `.env.example` → sin salida, exit code 1 — NO ignorado.
- `git ls-files .env.example` → `.env.example` — sigue rastreado.

Detalle completo en `docs/evidence/hallazgo-2-gitignore.txt`.

## Hallazgo 3 — redactForTelemetry sin implementar

### Problema encontrado
`redactForTelemetry` en `src/course-evaluation/index.ts` era un stub que lanzaba `throw new Error('redactForTelemetry must be implemented in the assigned week')`. No existía ningún mecanismo de sanitización para los datos sensibles definidos en el contrato.

### Riesgo
Si la aplicación comienza a registrar telemetría o datos de operación antes de implementar la sanitización, los campos sensibles (tokens, correos, nombres, identificadores personales, ubicación, fotos, evidencia y comentarios internos) podrían quedar expuestos en los registros.

### Solución
Se implementó `redactForTelemetry` en `src/course-evaluation/index.ts` sin agregar dependencias nuevas.

Comportamiento real implementado:
- Recorre objetos y listas sin mutar la entrada (siempre construye objetos y arreglos nuevos).
- Normaliza cada clave a minúsculas y sin `_`/`-` (p. ej. `accessToken` → `accesstoken`).
- Si la clave normalizada pertenece al conjunto sensible del contrato, sustituye el valor completo por `[REDACTED]`.
- Si la clave no es sensible, recursa para sanitizar dentro del valor.
- Conserva campos técnicos no sensibles como `incidentId`, `correlationId`, `status`, `attempt` y `durationMs`.

Conjunto sensible normalizado: `authorization`, `password`, `token`, `accesstoken`, `refreshtoken`, `email`, `displayname`, `name`, `userid`, `reporterid`, `technicianid`, `assignedtechnicianid`, `location`, `latitude`, `longitude`, `photos`, `evidence`, `internalcomments`, `assignmenthistory`.

### Antes
```ts
export function redactForTelemetry(_input: unknown): unknown {
  return pending('redactForTelemetry');
}
```

### Después
```ts
const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set<string>([
  'authorization', 'password', 'token', 'accesstoken', 'refreshtoken',
  'email', 'displayname', 'name', 'userid', 'reporterid', 'technicianid',
  'assignedtechnicianid', 'location', 'latitude', 'longitude', 'photos',
  'evidence', 'internalcomments', 'assignmenthistory',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : redactValue(item);
  }
  return result;
}

export function redactForTelemetry(input: unknown): unknown {
  return redactValue(input);
}
```

### Evidencia
Se verificó con el test público de Semana 4 (resultado real en `docs/evidence/hallazgo-3-redact-telemetry.txt`):

- `npx jest course-tests/public/week-04.test.ts --no-watchman --ci --runInBand --cacheDirectory .jest-cache` → exit code 0, PASS, 1 suite / 1 test.
- `npm run lint` → exit code 0.
- `npm run typecheck` → exit code 0.

## Validación final

Resultados reales de las comprobaciones de esta actividad:

| Comando | Resultado | Exit code |
|---|---|---|
| `npm audit --omit=dev --json` | Documenta H1: 2 HIGH / 0 CRITICAL (hallazgo pendiente) | 1 |
| `npx jest course-tests/public/week-04.test.ts --no-watchman --ci --runInBand --cacheDirectory .jest-cache` | PASS (1 suite, 1 test) | 0 |
| `npm run lint` | PASS | 0 |
| `npm run typecheck` | PASS | 0 |
| `git diff --check` | PASS | 0 |

Nota: `npm audit --omit=dev --json` termina con exit code 1 precisamente porque existen vulnerabilidades; ese resultado es la evidencia del Hallazgo 1, no una corrección.

## Archivos modificados

Solo se modificaron durante esta actividad:

- `.gitignore` (corrección del Hallazgo 2)
- `src/course-evaluation/index.ts` (corrección del Hallazgo 3)

Además se crearon los archivos de documentación de esta actividad:

- `docs/security-audit.md`
- `docs/evidence/hallazgo-1-audit.txt`
- `docs/evidence/hallazgo-2-gitignore.txt`
- `docs/evidence/hallazgo-3-redact-telemetry.txt`