# Controles de seguridad y privacidad — CampusOps, semana 4

## Inventario de datos sensibles

El contrato de sanitización de `docs/CAMPUSOPS_API.md` define campos que no deben llegar a telemetría en texto claro. El backend didáctico y sus rutas de incidencias describen recursos con reportantes, técnicos, ubicación, evidencias, comentarios y cambios de estado; por ello los datos sensibles se concentran en payloads de incidencias, peticiones HTTP y contexto de errores o logs.

| Dato | Posibles componentes de exposición existentes |
| --- | --- |
| Tokens y datos de sesión (`authorization`, `token`, `accessToken`, `refreshToken`) | Headers de peticiones y el wrapper `src/infrastructure/security/secureStorage.ts`. |
| Identidad de usuarios; correos y nombres visibles (`email`, `displayName`, `name`) | Objetos de perfil o de incidencia recibidos desde la API y contexto enviado al logger. |
| Identificadores de usuarios, reportantes y técnicos (`userId`, `reporterId`, `technicianId`, `assignedTechnicianId`) | Payloads de incidencias, asignaciones y contexto técnico. |
| Ubicación, latitud y longitud (`location`, `latitude`, `longitude`) | Payload de incidencias y la ruta de geocodificación documentada en `docs/CAMPUSOPS_API.md`. |
| Fotografías y evidencias (`photos`, `evidence`) | Payloads y referencias de evidencia de incidencias. |
| Comentarios internos (`internalComments`) | Payloads de incidencias y contexto de diagnóstico. |
| Historial de asignaciones (`assignmentHistory`) | Recurso de incidencia y sus cambios de asignación. |

## Amenazas relacionadas

`docs/threat-model.md` identifica las siguientes amenazas relevantes:

- **AMENAZA-03 — Filtrar datos sensibles en registros [MEDIA].** Los logs pueden exponer tokens de sesión, correos o coordenadas exactas en texto claro. El control declarado allí es sanitizar logs y evitar volcar objetos completos.
- **AMENAZA-04 — Exponer credenciales en código [ALTA].** API keys, contraseñas o tokens hardcodeados pueden quedar en el repositorio. El modelo asocia esta amenaza al escaneo automatizado de secretos en CI (`npm run audit:ci` y patrones sensibles).

El almacenamiento local de tokens es un caso adicional de protección de credenciales: `secureStorage.ts` reduce el riesgo si una sesión necesita persistirse en el dispositivo, pero no sustituye el escaneo de secretos que el modelo de amenazas asigna a AMENAZA-04.

## Controles implementados

### Redacción para telemetría

`redactForTelemetry` en `src/course-evaluation/index.ts` recorre objetos y arreglos sin mutar la entrada. Normaliza las claves a minúsculas y elimina `_` y `-`; si coincide con una clave sensible del contrato, reemplaza el valor completo por `"[REDACTED]"`. Esto cubre, entre otros, `authorization`, datos de identidad, coordenadas, fotografías, evidencias, comentarios internos e historial de asignaciones. Los campos técnicos no sensibles, como `incidentId`, `correlationId`, `status`, `attempt` y `durationMs`, se conservan.

### Sanitizador reutilizable

`src/infrastructure/security/sanitizer.ts` implementa `normalizeKey`, `isSensitiveKey` y `sanitize`. Además de la redacción recursiva, gestiona referencias circulares con `WeakSet` y representa objetos `Error` conservando `name` y `message` junto con sus propiedades enumerables ya sanitizadas. Su comportamiento se encuentra cubierto por `src/__tests__/sanitizer.test.ts`.

### Logger seguro

`src/infrastructure/logging/secureLogger.ts` expone `logDebug`, `logInfo`, `logWarn` y `logError`. Antes de emitir un contexto lo pasa por `redactForTelemetry`; para un `Error`, `logError` conserva únicamente nombre y mensaje, sin serializar el stack. La emisión está condicionada a `__DEV__`. Este logger controla solamente los contextos que se le entregan, no los logs propios de otras librerías.

### Persistencia y limpieza de sesión

`src/infrastructure/security/secureStorage.ts` usa `expo-secure-store` para `sessionToken` y `refreshToken`, con la opción `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Rechaza valores vacíos o mayores de 2048 bytes y reemplaza errores del proveedor por mensajes que no incluyen el token. `clearSecureSession` intenta borrar ambos valores con `Promise.allSettled`; si cualquiera falla, informa que la limpieza no fue completa después de haber intentado ambas eliminaciones.

## Elección de almacenamiento seguro

`package.json` declara `expo-secure-store` `~57.0.4`, compatible con el proyecto Expo `~57.0.9`; por eso se seleccionó para el wrapper existente. La librería delega la protección de credenciales al almacenamiento seguro del sistema operativo (Keychain en iOS y Keystore en Android), evitando guardar el token directamente en una preferencia ordinaria.

`AsyncStorage` no aparece como dependencia de este repositorio y no proporciona por sí mismo almacenamiento cifrado apropiado para credenciales; no es la opción elegida para tokens. `react-native-keychain` tampoco está instalado. Aunque puede acceder a Keychain/Keystore, añadirlo requeriría incorporar otra dependencia y su configuración nativa no sigue tan directamente el flujo Expo que ya usa `expo-secure-store`. Esta comparación no implica que esas alternativas sean inseguras en todos los usos: la decisión se limita al flujo y dependencias actuales del proyecto.

## Riesgo residual

- Las dependencias externas pueden generar registros que no pasan por `secureLogger.ts` ni por los sanitizadores.
- El límite de 2048 bytes impuesto por `secureStorage.ts` impide guardar valores grandes; el módulo los rechaza, pero no resuelve dónde persistirlos de forma segura.
- El comportamiento de almacenamiento seguro puede diferir en web y las pruebas usan un mock de Jest del módulo nativo; esas pruebas no verifican el Keychain o Keystore de un dispositivo real.
- Un dispositivo con root o jailbreak puede quedar comprometido fuera de las garantías de la aplicación.
- Capturas de pantalla, volcados de memoria, copias de seguridad o accesos físicos fuera del control directo de CampusOps pueden exponer información mostrada o ya extraída.
