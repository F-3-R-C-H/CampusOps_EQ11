# Controles de Seguridad — CampusOps Semana 4

## 1. Datos sensibles identificados

| Dato | Ubicación en la app | Riesgo si se expone |
|------|---------------------|---------------------|
| Token de sesión (`authorization`) | Headers HTTP, respuesta de login | Suplantación de identidad completa |
| Correo y nombre (`email`, `displayName`, `name`) | Perfil del actor, logs de error | Exposición de PII |
| IDs de usuario/técnico (`userId`, `reporterId`, `technicianId`, `assignedTechnicianId`) | Payload de incidencias, logs de asignación | Identificación personal |
| Ubicación (`location`, `latitude`, `longitude`) | Payload de incidencias, geocodificación | Rastreo físico del reportante |
| Fotografías (`photos`) | Payload de evidencias, caché de imágenes | Exposición de contenido sensible |
| Comentarios internos (`internalComments`) | Payload de incidencias, logs de sincronización | Filtración de notas operativas internas |
| Historial de asignaciones (`assignmentHistory`) | Logs de cambios de estado | Trazabilidad no autorizada de personal |
| Refresh token (`refreshToken`, `accessToken`) | Almacenamiento local, flujo de sesión | Extensión no autorizada de la sesión |

## 2. Controles implementados

### 2.1 Sanitización de registros (`redactForTelemetry`)

**Amenaza relacionada:** AMENAZA-03 — Filtrar datos sensibles en registros.

**Implementación:** La función `redactForTelemetry` en `src/course-evaluation/index.ts` recorre recursivamente objetos y arreglos, sustituyendo el valor completo por `[REDACTED]` cuando la clave normalizada (minúsculas, sin `_` ni `-`) pertenezca a la lista del contrato `CAMPUSOPS_API.md`. No muta la entrada original.

**Campos redactados:** `authorization`, `password`, `token`, `accessToken`, `refreshToken`, `email`, `displayName`, `name`, `userId`, `reporterId`, `technicianId`, `assignedTechnicianId`, `location`, `latitude`, `longitude`, `photos`, `evidence`, `internalComments`, `assignmentHistory`.

**Campos técnicos conservados:** `incidentId`, `correlationId`, `status`, `attempt`, `durationMs` y cualquier campo no listado como sensible.

### 2.2 Módulo de sanitización reutilizable (`sanitizer.ts`)

**Amenaza relacionada:** AMENAZA-03 — Filtrar datos sensibles en registros.

**Implementación:** `src/infrastructure/security/sanitizer.ts` expone `normalizeKey`, `isSensitiveKey` y `sanitize`, utilizable desde cualquier capa de la aplicación. Añade protección contra referencias circulares (mediante `WeakSet`) y manejo explícito de instancias `Error` (preserva `name` y `message`, redacta propiedades enumerables sensibles).

### 2.3 Almacenamiento seguro de tokens (`secureStorage.ts`)

**Amenaza relacionada:** AMENAZA-04 — Exposición de credenciales en código y almacenamiento.

**Mecanismo elegido:** `expo-secure-store` (SDK 57 oficial de Expo).

**Justificación:** Usa `EncryptedSharedPreferences` (AES-256-GCM) en Android y `Keychain` con `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` en iOS. Proporciona cifrado a nivel de sistema operativo sin requerir eyección del proyecto Expo ni dependencias fuera del ecosistema oficial.

**Implementación:** `src/infrastructure/security/secureStorage.ts` expone funciones para guardar, leer y eliminar `sessionToken` y `refreshToken`. Valida que el token no esté vacío y no supere 2048 bytes. Los errores nunca incluyen el valor del token. `clearSecureSession` usa `Promise.allSettled` para garantizar que un fallo parcial no deje tokens residuales.

**Alternativas descartadas:**
- `AsyncStorage`: sin cifrado, datos en texto plano accesibles con backup o ADB.
- `react-native-keychain`: requiere prebuild, fuera del ecosistema oficial de Expo SDK 57.

### 2.4 Logger seguro (`secureLogger.ts`)

**Amenaza relacionada:** AMENAZA-03 — Filtrar datos sensibles en registros.

**Implementación:** `src/infrastructure/logging/secureLogger.ts` expone `logDebug`, `logInfo`, `logWarn` y `logError`. Todo contexto pasa por `redactForTelemetry` antes de ser emitido. `logError` extrae solo `name` y `message` de los objetos `Error`, descartando el stack trace que puede contener valores de variables. Solo emite en `__DEV__`.

### 2.5 Eliminación de secretos en código

**Amenaza relacionada:** AMENAZA-04 — Exposición de credenciales en código.

**Control:** Los valores `course-valid-token` y los actorIds del backend son fixtures públicos de prueba documentados en `CAMPUSOPS_API.md`, no secretos reales. La URL del backend se configura mediante variable de entorno en `.env` (excluido de git mediante `.gitignore`). El escaneo reproducible en `reports/week-04/secret-scan.json` confirma 0 credenciales reales encontradas.

## 3. Relación con el modelo de amenazas (Semana 3)

| Amenaza (threat-model.md) | Control de esta semana |
|---------------------------|------------------------|
| AMENAZA-03 — Filtrar datos en registros | `redactForTelemetry`, `sanitizer.ts`, `secureLogger.ts` |
| AMENAZA-04 — Exponer credenciales en código | `expo-secure-store`, `.gitignore` actualizado, escaneo reproducible |

Las amenazas AMENAZA-01, AMENAZA-02 y AMENAZA-05 se tratan mediante controles de autorización y validación en la capa de aplicación, no requieren cambios adicionales en esta semana.

## 4. Riesgo residual

| Riesgo | Descripción | Probabilidad | Mitigación actual |
|--------|-------------|:------------:|-------------------|
| Logs de dependencias externas | Librerías npm pueden emitir trazas con datos no sanitizados | Media | Limitar el nivel de log en producción; revisar dependencias críticas |
| Metro bundler en desarrollo | En modo dev, Metro puede registrar requests completos con headers | Baja | Afecta solo entorno de desarrollo; no se despliega a producción |
| Stack traces del runtime | Un crash nativo puede capturar valores de variables en el stack | Media | Evaluar integración con servicio de crash reporting que sanitice automáticamente |
| Límite de 2KB en expo-secure-store | Tokens que excedan 2048 bytes no pueden almacenarse de forma segura | Baja | El módulo rechaza explícitamente valores fuera de rango; para datos mayores usar cifrado en AsyncStorage |
| Dispositivos rooteados/jailbreak | El Keystore puede quedar expuesto si el dispositivo está comprometido a nivel de OS | Baja | Fuera del control de la aplicación; se documenta como riesgo aceptado |
