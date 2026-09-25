# Auditoría de seguridad — Semana 4
**Proyecto:** CampusOps (Equipo 11)
**Autora:** Tonantzin
**Rama:** week4/security-audit-tonantzin

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | La función `redactForTelemetry` (`src/course-evaluation/index.ts`) no estaba implementada; solo lanzaba un error | Si el equipo empieza a enviar objetos de sesión, perfil o incidentes a logs/telemetría sin pasar por esta función, tokens, correos, fotos y comentarios internos quedarían expuestos tal cual | Se implementó la función para redactar recursivamente los campos sensibles (`authorization`, `accessToken`, `email`, `displayName`, `location`, `photos`, `internalComments`, etc.), preservando el contexto técnico no sensible | `docs/evidence/redact-telemetry-tests.png` |
| 2 | No existía ninguna capa de almacenamiento seguro para el token de sesión | Al no haber una utilidad ya lista, lo más probable era que en semanas próximas (login/sesión) se terminara usando `AsyncStorage`, que guarda los datos en texto plano y es legible por cualquier proceso con acceso al almacenamiento del dispositivo | Se creó `src/infrastructure/secureStore/SessionSecureStore.ts`, un wrapper sobre `expo-secure-store` (Keychain/Keystore) para guardar, leer y borrar el token, con pruebas negativas que confirman que nunca se guarda en texto plano | `docs/evidence/secure-store-tests.png` |
| 3 | No existía verificación automatizada de secretos para la Semana 4 | La ausencia de credenciales expuestas dependía solo de revisión manual, sin evidencia reproducible en cada entrega | Se creó `tools/security/scan-secrets.mjs`, que reutiliza los patrones de `tools/course_public_evaluator.py` y genera `reports/week-04/secret-scan.json` con el resultado (`hits: []`) | `reports/week-04/secret-scan.json` + `docs/evidence/gitignore-env.png` |

---

## Hallazgo 1 — `redactForTelemetry` sin implementar

### Problema encontrado
En `src/course-evaluation/index.ts`, la función `redactForTelemetry` era un *stub*:
```ts
export function redactForTelemetry(_input: unknown): unknown {
  return pending('redactForTelemetry');
}
```

### Riesgo
Ocultar un dato en la UI (por ejemplo, no mostrar el token en pantalla) **no significa que el dato esté protegido**. Si cualquier parte del código llega a loguear o enviar a un servicio de telemetría un objeto de sesión, perfil o incidente sin pasar por `redactForTelemetry`, datos como el token de acceso, el correo del usuario, su nombre, ubicación o comentarios internos quedarían expuestos completos en los logs.

### Solución
Se implementó la función para reemplazar por `'[REDACTED]'` cualquier campo cuyo nombre corresponda a información sensible (`authorization`, `accessToken`, `email`, `displayName`, `location`, `photos`, `internalComments`, entre otros), recorriendo objetos anidados, y conservando el resto del contexto técnico (`incidentId`, `error`, `attempt`, etc.) que sí es útil para depurar.

### Antes
```ts
export function redactForTelemetry(_input: unknown): unknown {
  return pending('redactForTelemetry');
}
```

### Después
```ts
export function redactForTelemetry(input: unknown): unknown {
  return isPlainObject(input) ? redactObject(input) : input;
}
```

### Evidencia
- `npx jest course-tests/public/week-04.test.ts` → PASS
- `npx jest course-tests/negative-week-04.test.ts` → PASS (confirma que el token/correo/nombre reales nunca aparecen en el JSON resultante)
- Captura en `docs/evidence/redact-telemetry-tests.png`

---

## Hallazgo 2 — Sin almacenamiento seguro para el token de sesión

### Problema encontrado
El proyecto aún no define dónde ni cómo se guardará el token de sesión cuando se implemente el login (semanas 5–6). No existía ninguna utilidad que indicara "aquí se guarda de forma segura".

### Riesgo
`AsyncStorage` guarda los datos sin cifrar, en texto plano, en el almacenamiento del dispositivo. Cualquier persona o app con acceso a ese almacenamiento podría leer el token de sesión directamente.

### Solución
Se creó `SessionSecureStore` (`src/infrastructure/secureStore/SessionSecureStore.ts`), un wrapper sobre `expo-secure-store` con métodos `saveToken`, `getToken` y `clearToken`. Se agregaron pruebas negativas que confirman que el token se guarda a través de `expo-secure-store` (cifrado por el SO) y nunca en una variable en texto plano ni en `AsyncStorage`.

### Antes
No existía ningún módulo de almacenamiento de sesión en el proyecto.

### Después
```ts
export const SessionSecureStore = {
  async saveToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  },
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  },
  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  },
};
```

### Evidencia
- `npx jest src/infrastructure/secureStore/SessionSecureStore.test.ts` → PASS
- Captura en `docs/evidence/secure-store-tests.png`

---

## Hallazgo 3 — Sin escaneo automatizado de secretos para la Semana 4

### Problema encontrado
`.env` sí estaba en `.gitignore`, pero no existía un reporte reproducible que demostrara, en cada entrega, que no hay credenciales expuestas en el código.

### Riesgo
Depender solo de revisión manual es propenso a errores humanos: un secreto podría subirse por accidente y no detectarse hasta mucho después.

### Solución
Se creó `tools/security/scan-secrets.mjs`, que reutiliza los mismos patrones de detección (`private_key`, `github_token`, `aws_access_key`, `EXPO_PUBLIC_*SECRET*`) ya usados en `tools/course_public_evaluator.py`, y genera `reports/week-04/secret-scan.json` de forma reproducible.

### Evidencia
- `node tools/security/scan-secrets.mjs` → `hits=0`
- `git status` mostrando que `.env` no se sube — captura en `docs/evidence/gitignore-env.png`
- Reporte completo en `reports/week-04/secret-scan.json`

---

## Nota sobre datos ficticios
Todos los tokens, correos y nombres usados en este documento y en las pruebas son ficticios, generados únicamente para demostrar el hallazgo. Ninguna credencial real fue expuesta en ningún momento.
