# 📋 Semana 06
## CampusOps EQ-11: "Sesión Segura y Diagnóstico Bajo Concurrencia"

**Proyecto:** CampusOps_EQ11 (React Native + Expo + TypeScript)  
**Materia:** Desarrollo Móvil Integral (DMI)  
**Semana:** 06 — Sesión Segura  
**Puntos totales:** 8 puntos (criterios AC-01 a AC-05) + 2 puntos (quiz individual)  
**Equipo EQ-11:**
- **Danna** (Matrícula: `3523110097`)
- **Tonantzin** (Matrícula: `3523110858`)
- **Fernando** (Matrícula: `3523110683`)

---

## 1. 🎯 Objetivo de la Semana 06

Implementar y comprobar un ciclo de vida de sesión seguro y robusto bajo concurrencia:
1. **Estados de sesión claros y observables:** Inicio (`login`), activo (`authenticated`), expiración (`401`), renovación coordinada (`refreshing / single-flight`), fallo de renovación y cierre limpio (`logout` / retorno a `anonymous`).
2. **Autorización y perfiles CampusOps:** Validación estricta de permisos según los perfiles de la aplicación (`reportante`, `técnico`, `coordinador`).
3. **Coordinación de renovación concurrente:** Single-flight en peticiones simultáneas — cuando N peticiones reciban un 401, debe dispararse una única renovación compartida, con reintentos acotados (sin bucles infinitos).
4. **Manejo de fallos y limpieza segura:** Si el refresh falla o se solicita logout, se eliminan los tokens del almacenamiento seguro (`expo-secure-store`) y ningún token viaja en logs.

---

## 2. 📊 Rúbrica y Criterios de Evaluación (8 puntos)

| Criterio | Puntos | Tipo | Qué evalúa el profesor |
|---|:---:|:---:|---|
| **AC-01 — Reproducción** | 2.5 | Automático | `make verify-week-06`, `make feedback`, TypeScript, ESLint, smoke test y bundle release sin errores. |
| **AC-02 — Comportamiento** | 2.0 | Automático | Pruebas públicas (`course-tests/public/week-06.test.ts`) aprobadas. Login, expiración, renovación compartida y logout con almacenamiento seguro. |
| **AC-03 — Manejo de Fallas** | 1.5 | Automático | Comprobación observable de que no hay bucles de renovación, ni llamadas duplicadas al refresh endpoint, y que `logout` borra el estado persistido. |
| **AC-04 — Decisión Técnica** | 1.5 | Semiautomático | `evidence/week-06/engineering.json`: justificación técnica de la política de renovación y transición segura ante fallo. |
| **AC-05 — Aportación Individual** | 0.5 | Semiautomático | `evidence/week-06/individual.json`: commits propios, archivos técnicos, predicción previa, comando y resultado para Danna, Tonantzin y Fernando. |

---

## 3. 👥 Repartición Estratégica de Tareas

Para garantizar que **las tres integrantes** tengan código real, pruebas unitarias, commits individuales con su propio usuario Git y una decisión explicable para AC-05, el trabajo se divide en 3 bloques complementarios e independientes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA DE SEMANA 06                       │
├──────────────────────────┬─────────────────────────┬───────────────────┤
│  BLOQUE 1 (Danna)        │  BLOQUE 2 (Tonantzin)   │ BLOQUE 3(Fernando)│
├──────────────────────────┼─────────────────────────┼───────────────────┤
│ • coordinateRefresh()    │ • Perfiles CampusOps    │ • Interceptor HTTP│
│   (evaluación pública)   │   (roles y permisos)    │   Single-Flight   │
│ • State Machine (Mermaid)│ • Auth service/session  │ • Mutex & retries │
│ • Tests de eventos auth  │ • reports/auth-tests    │ • reports/concurr.│
│                          │                         │ • engineering.json│
└──────────────────────────┴─────────────────────────┴───────────────────┘
```

---

### 👧 Bloque 1: Danna (Matrícula: `3523110097`)
**Rol:** Arquitectura de Estados de Sesión y Adaptador de Evaluación

> 💡 **En palabras sencillas (¿Qué hará Danna?):**  
> Danna se encargará de programar la lógica del "semáforo" de la sesión. Si varias peticiones dan error porque el pase/token venció, su código se asegura de que solo se pida una renovación y que todas las peticiones esperen el nuevo pase para volver a intentar. Además, creará el diagrama visual (en Mermaid) que muestra cómo viaja la sesión: desde que el usuario no ha entrado, cuando está adentro, cuando se renueva el pase y cuando se sale (logout).

- **Rama Git:** `feature/danna-week06-coordinaterefresh`
- **Archivos asignados:**
  1. `src/course-evaluation/index.ts` (implementar función pública `coordinateRefresh`)
  2. `docs/session-state-machine.mmd` (diagrama Mermaid con todos los estados y transiciones)
  3. `src/__tests__/coordinateRefresh.test.ts` (suite exhaustiva de pruebas unitarias)

📋 **Paso a paso para Danna:**
1. **Crear su rama:** En la terminal, con `main` actualizado, ejecutar:
   ```bash
   git checkout -b feature/danna-week06-coordinaterefresh
   ```
2. **Implementar `coordinateRefresh`:** Abrir `src/course-evaluation/index.ts`, buscar la función `coordinateRefresh` (que tiene el `pending`) y programar la lógica del acumulador de eventos:
   - Contar llamadas de refresh asegurando que múltiples `request401` seguidos solo cuenten como `refreshCalls: 1`.
   - Cuando llegue `refreshSucceeded`, cambiar a `status: 'authenticated'`, actualizar la generación y guardar la lista de peticiones a reintentar.
   - Cuando llegue `refreshFailed` o `logout`, regresar a `status: 'anonymous'` y poner `persistedToken: null`.
3. **Crear el diagrama Mermaid:** Crear el archivo `docs/session-state-machine.mmd` con el diagrama de estados de sesión mostrando las transiciones (`Anonymous` ➔ `Authenticated` ➔ `Refreshing` ➔ `Logout`).
4. **Crear y ejecutar las pruebas:** Crear `src/__tests__/coordinateRefresh.test.ts` con pruebas de casos exitosos, concurrentes y de fallo, y correr:
   ```bash
   npm test -- --ci --runInBand course-tests/public/week-06.test.ts src/__tests__/coordinateRefresh.test.ts
   ```
5. **Guardar y subir su commit:**
   ```bash
   git add src/course-evaluation/index.ts docs/session-state-machine.mmd src/__tests__/coordinateRefresh.test.ts
   git commit -m "feat(week-06): implementar coordinateRefresh y maquina de estados de sesion"
   git push origin feature/danna-week06-coordinaterefresh
   ```
6. **Crear Pull Request:** Abrir el PR en GitHub hacia `main` para que el equipo lo revise.

---

### 👧 Bloque 2: Tonantzin (Matrícula: `3523110858`)
**Rol:** Modelo de Autorización, Perfiles CampusOps y Reporte de Pruebas Auth

> 💡 **En palabras sencillas (¿Qué hará Tonantzin?):**  
> Tonantzin será la encargada de las "reglas y permisos" de los usuarios. Hará que la app sepa quién es quién (estudiante que reporta, técnico que arregla o coordinador que supervisa) y evitará que hagan cosas que no les tocan (por ejemplo, que un técnico no pueda dar por cerrado un caso que solo el coordinador debe cerrar). Dejará pruebas que demuestren que si alguien intenta hacer algo no permitido, el sistema lo bloquea con error de permiso (403).

- **Rama Git:** `feature/tonantzin-week06-auth-roles`
- **Archivos asignados:**
  1. `src/domain/models/Session.ts` (modelo de sesión, tokens y perfil activo)
  2. `src/domain/security/CampusOpsAuthorization.ts` (reglas de autorización por rol)
  3. `src/__tests__/campusOpsAuthorization.test.ts` (pruebas de permisos por actor)
  4. `reports/week-06/auth-tests.json` (reporte estructurado de pruebas de auth)

📋 **Paso a paso para Tonantzin:**
1. **Crear su rama:** En la terminal, con `main` actualizado, ejecutar:
   ```bash
   git checkout -b feature/tonantzin-week06-auth-roles
   ```
2. **Modelar sesión y permisos:** Crear `src/domain/models/Session.ts` con los tipos de perfil (`reporter`, `technician`, `coordinator`). Crear `src/domain/security/CampusOpsAuthorization.ts` con una función `canPerformAction(role, action)` que valide qué operaciones puede hacer cada rol.
3. **Crear pruebas de autorización:** Crear `src/__tests__/campusOpsAuthorization.test.ts` verificando:
   - Que un técnico pueda hacer `start` y `resolve`, pero no `close`.
   - Que un reportante no pueda hacer `assign`.
   - Que un intento no permitido devuelva error de acceso denegado (403).
4. **Ejecutar sus pruebas:**
   ```bash
   npm test -- --ci --runInBand src/__tests__/campusOpsAuthorization.test.ts
   ```
5. **Generar reporte de auth:** Crear `reports/week-06/auth-tests.json` con los checks ejecutados (incluyendo casos normales y de rechazo 403) siguiendo el formato del curso.
6. **Guardar y subir su commit:**
   ```bash
   git add src/domain/models/Session.ts src/domain/security/CampusOpsAuthorization.ts src/__tests__/campusOpsAuthorization.test.ts reports/week-06/auth-tests.json
   git commit -m "feat(week-06): implementar matriz de autorizacion por perfiles y pruebas auth"
   git push origin feature/tonantzin-week06-auth-roles
   ```
7. **Crear Pull Request:** Abrir el PR en GitHub hacia `main`.

---

### 👦 Bloque 3: Fernando (Matrícula: `3523110683`)
**Rol:** Cliente HTTP Concurrente (Single-Flight Mutex), Prevención de Bucles y Decisión Técnica

> 💡 **En palabras sencillas (¿Qué hará Fernando?):**  
> Fernando conectará la aplicación con la red para que use el pase/token guardado de forma segura en el celular y no un texto fijo. Si se mandan varias acciones al mismo tiempo y el pase ya venció, se asegurará de que no se trabe en un ciclo infinito de intentos, que no salgan contraseñas ni tokens en los registros de texto (logs), y que si el pase de renovación de plano ya no sirve, borre todo del celular y cierre la sesión limpiamente. Además, redactará la justificación técnica de por qué se eligió esta solución.

- **Rama Git:** `feature/fernando-week06-http-concurrency`
- **Archivos asignados:**
  1. `src/infrastructure/http/CourseHttpClient.ts` (ampliar para integrar token dinámico desde `secureStorage` e interceptor de 401 con single-flight)
  2. `src/infrastructure/security/SessionCoordinator.ts` (mutex de refresh compartido y límite de reintentos)
  3. `src/__tests__/sessionConcurrency.test.ts` (pruebas de concurrencia: 3 peticiones paralelas recibiendo 401 que ejecutan 1 solo refresh)
  4. `reports/week-06/concurrency.json` (reporte estructurado de concurrencia)
  5. `evidence/week-06/engineering.json` (justificación de la decisión técnica de ingeniería)

📋 **Paso a paso para Fernando:**
1. **Crear su rama:** En la terminal, con `main` actualizado, ejecutar:
   ```bash
   git checkout -b feature/fernando-week06-http-concurrency
   ```
2. **Implementar el coordinador de sesión:** Crear `src/infrastructure/security/SessionCoordinator.ts` con la promesa compartida (single-flight): si hay un refresh en curso, las demás peticiones esperan la misma promesa. Poner tope de 1 reintento para evitar bucles.
3. **Conectar el cliente HTTP:** En `src/infrastructure/http/CourseHttpClient.ts`, cambiar el token hardcodeado por la lectura de `getSessionToken()` y conectar el coordinador ante respuestas 401. En caso de fallo definitivo, llamar a `clearSecureSession()`.
4. **Crear y correr pruebas de concurrencia:** Crear `src/__tests__/sessionConcurrency.test.ts` simulando 3 peticiones simultáneas con token vencido y verificar que solo ocurra 1 refresh:
   ```bash
   npm test -- --ci --runInBand src/__tests__/sessionConcurrency.test.ts
   ```
5. **Redactar reportes y decisión:** Crear `reports/week-06/concurrency.json` y `evidence/week-06/engineering.json` justificando la política de renovación single-flight y su alternativa evaluada.
6. **Guardar y subir su commit:**
   ```bash
   git add src/infrastructure/http/CourseHttpClient.ts src/infrastructure/security/SessionCoordinator.ts src/__tests__/sessionConcurrency.test.ts reports/week-06/concurrency.json evidence/week-06/engineering.json
   git commit -m "feat(week-06): implementar interceptor single-flight, prevencion de bucles y reporte de concurrencia"
   git push origin feature/fernando-week06-http-concurrency
   ```
7. **Crear Pull Request:** Abrir el PR en GitHub hacia `main`.

---

## 4. 📝 Entregables Finales y Repartición de Archivos

| Archivo de Entrega | Responsable Principal | Revisora / Aportación |
|---|:---:|:---:|
| `docs/session-state-machine.mmd` | **Danna** | Tonantzin y Fernando |
| `reports/week-06/auth-tests.json` | **Tonantzin** | Danna y Fernando |
| `reports/week-06/concurrency.json` | **Fernando** | Danna y Tonantzin |
| `evidence/week-06/engineering.json` | **Fernando** | Tonantzin y Danna |
| `evidence/week-06/individual.json` | **Consolidado (los 3)** | Cada quien llena su registro |

---

## 5. 🚀 Flujo de Trabajo en Git y Orden de Entrega

Para evitar conflictos y asegurar que la rúbrica AC-05 otorgue el puntaje completo:

### Paso 1: Actualizar `main`
Todas deben partir de la última versión estable de `main`:
```bash
git checkout main
git pull origin main
```

### Paso 2: Crear sus ramas individuales
- Danna: `git checkout -b feature/danna-week06-coordinaterefresh`
- Tonantzin: `git checkout -b feature/tonantzin-week06-auth-roles`
- Fernando: `git checkout -b feature/fernando-week06-http-concurrency`

### Paso 3: Implementar, probar y hacer commits propios
Cada una ejecuta sus pruebas correspondientes y genera sus commits con su usuario y correo configurados en Git.

### Paso 4: Pull Requests e Integración en `main`
1. Danna abre PR a `main` → Se revisa y mergea.
2. Tonantzin rebasea sobre `main` actualizado, abre PR → Se revisa y mergea.
3. Fernando rebasea sobre `main` actualizado, abre PR → Se revisa y mergea.

### Paso 5: Generar el commit final exclusivo de evidencias
Una vez mergeado todo en `main`:
1. Correr los comandos de verificación obligatorios:
   ```bash
   make feedback
   make verify-week-06
   make public-test-week-06
   ```
2. Obtener el commit SHA actual:
   ```bash
   git rev-parse HEAD
   ```
3. Completar `evidence/week-06/individual.json` con los datos reales de las 3 integrantes.
4. Crear el commit exclusivo de reportes y evidencias:
   ```bash
   git add reports/ evidence/ docs/
   git commit -m "evidence: registrar reportes y evidencias completas semana 06"
   ```
5. Crear la etiqueta `week-06-final` y verificar:
   ```bash
   git tag -a week-06-final -m "DMI week 06 final"
   make evidence-week-06
   ```
6. Subir a GitHub:
   ```bash
   git push origin main
   git push origin week-06-final
   git rev-list -n 1 week-06-final
   ```

---

## 6. ⚠️ Reglas Estrictas del Profesor para Recordar
- 🚫 **No exponer tokens en logs:** Respetar `redactForTelemetry` y `logWarn`.
- 🚫 **No bucles infinitos:** El reintento tras un 401 debe estar acotado a máximo 1 intento.
- 🚫 **No usar credenciales reales:** Todo se prueba con los actores didácticos del curso (`reporter-1`, `technician-1`, `coordinator-1`).
- 🚫 **No sustituir pruebas con capturas:** Las capturas de la actividad individual complementan, pero no reemplazan los archivos `.json` de pruebas y evidencias ejecutables.
- 🚫 **No olvidar el quiz semanal 6:** Cada integrante debe responder en Classroom su quiz de 3 preguntas (2 puntos adicionales).
