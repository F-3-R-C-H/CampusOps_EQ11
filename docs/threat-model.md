# Modelo de amenazas — CampusOps Semana 3

## Activos a proteger

- Sesiones de usuario (tokens de autenticación JWT)
- Fotografías adjuntas a incidencias y reportes
- Ubicaciones geográficas registradas en incidentes
- Asignaciones de técnicos a órdenes de trabajo
- Registros de auditoría y bitácoras del sistema

## Fronteras de confianza

- Aplicación móvil (React Native / Expo) ↔ Backend API (HTTPS)
- Backend API ↔ Base de datos y almacenamiento de archivos
- Aplicación móvil ↔ Servicios del sistema operativo (Cámara, GPS)

## Amenazas priorizadas

### AMENAZA-01 — Consultar incidencias ajenas [ALTA]

**Descripción:**
Un usuario reportante intenta consultar órdenes de trabajo o incidencias de otros usuarios modificando identificadores en peticiones.

**Control:**
Validación de autorización en la capa Application mediante verificación del token de sesión en cada consulta.

**Verificación:**
Prueba negativa: petición sin token o con token de otro usuario retorna HTTP 401/403.

**Riesgo residual:**
Si el usuario comparte su dispositivo sin cerrar la sesión activa.

### AMENAZA-02 — Alterar asignaciones de técnicos [ALTA]

**Descripción:**
Un técnico modifica la asignación de una incidencia que no le corresponde para alterar tiempos de atención.

**Control:**
Validación estricta de roles (`ADMIN` / `COORDINADOR`) en los casos de uso antes de persistir cambios.

**Verificación:**
Prueba unitaria en Application: técnico sin permisos recibe excepción de autorización al intentar reasignar.

**Riesgo residual:**
Pérdida momentánea de consistencia si ocurren modificaciones concurrentes sin conexión.

### AMENAZA-03 — Filtrar datos sensibles en registros [MEDIA]

**Descripción:**
Los logs del sistema exponen tokens de sesión, correos o coordenadas exactas en texto claro.

**Control:**
Sanitización de logs: registrar únicamente IDs sintéticos y códigos de error normalizados sin volcar objetos completos.

**Verificación:**
Regla ESLint y revisión manual asegurando que ningún `console.log` imprima credenciales o payloads sin filtrar.

**Riesgo residual:**
Dependencias de terceros que emitan logs no controlados por la aplicación.

### AMENAZA-04 — Exponer credenciales en código [ALTA]

**Descripción:**
API keys, contraseñas o tokens hardcodeados en el código fuente del repositorio.

**Control:**
Escaneo automatizado de secretos en el pipeline de CI (`npm run audit:ci` y búsqueda de patrones sensibles).

**Verificación:**
El pipeline de GitHub Actions falla automáticamente si detecta cadenas que coincidan con llaves privadas o credenciales.

**Riesgo residual:**
Secretos que empleen estructuras o patrones completamente desconocidos para las reglas de auditoría.

### AMENAZA-05 — Falsificación de ubicación geográfica [MEDIA]

**Descripción:**
Un técnico reporta haber atendido una incidencia alterando las coordenadas GPS para simular presencia física en el campus.

**Control:**
Validación de rango de coordenadas dentro del perímetro del campus universitario y verificación de marcas de tiempo del sistema.

**Verificación:**
Prueba unitaria: envío de coordenadas fuera de los límites de geocerca del campus genera estado de advertencia e inspección manual.

**Riesgo residual:**
Manipulación avanzada a nivel de sistema operativo en dispositivos rooteados.

