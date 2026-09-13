# ADR-002 — Stack tecnológico de CampusOps

## Estado

Aceptada — Semana 2

## Contexto

CampusOps es una aplicación móvil de gestión de incidencias de un campus universitario, desarrollada como proyecto de equipo de tres integrantes en el curso de Desarrollo Móvil Integral. En esta actividad la entrega se evalúa desde un SHA fijo mediante reproducción docente, pruebas públicas y evidencia estructurada.

El curso fija el stack del proyecto: **React Native + Expo + TypeScript**. El enunciado de la Semana 2 instruye "Usen el mismo repositorio y stack: React Native + Expo + TypeScript" y aclara que "ya están definidos: no deben volver a elegir el stack" (`docs/assignments/week-02.md`). ADR-001 ya reconoce que "el stack tecnológico (React Native, Expo, TypeScript) ya está fijado por el curso y no forma parte de esta decisión".

Por lo tanto, este ADR no abre una elección tecnológica: documenta y justifica una decisión vinculante impuesta por el contexto, y registra sus implicaciones, restricciones y costos para el equipo. La Semana 2 se concentra en la arquitectura interna (UI → Application → Domain ← Infrastructure) y en los límites de responsabilidades, no en volver a seleccionar el stack.

## Decisión

CampusOps utiliza, en las versiones verificadas en el repositorio:

- **React Native 0.86.2**
- **Expo SDK 57** (paquete `expo` 57.0.16 instalado; firma `~57.0.9` en `package.json`)
- **TypeScript 6.0.3**

Estas versiones son las fijadas por el starter del curso y deben conservarse.

## Tecnologías y rol

| Tecnología | Versión | Rol en el proyecto | Evidencia/archivo de verificación |
|---|---|---|---|
| React Native | 0.86.2 | Framework móvil; componentes nativos de las pantallas (`SafeAreaView`, `StyleSheet`) y New Architecture del runtime | `package.json` (dependencia `react-native: 0.86.2`); `App.tsx`; `app.json` (`newArchEnabled: true`) |
| Expo | SDK 57 (instalado 57.0.16) | Herramientas de desarrollo, registro de la app, prebuild nativo, export del bundle Android y presets de lint/test | `package.json` (`expo: ~57.0.9`, scripts `expo start/run/export/prebuild`); `index.ts`; `app.json` |
| TypeScript | 6.0.3 | Tipado estricto y verificación de tipos en todo el código | `package.json` (`typescript: ~6.0.3`, script `typecheck`); `tsconfig.json` |
| React | 19.2.3 | Librería base de componentes sobre la que corre Expo/RN | `package.json`; `react-test-renderer` en devDependencies |
| jest-expo / Jest / Testing Library | jest-expo 57.0.4 / Jest 29.7.0 / RNTL 14.0.1 | Ejecución de pruebas con el preset de Expo | `package.json` (bloque `jest`, scripts `test:*`) |
| ESLint + eslint-config-expo | 9.39.5 / 57.0.1 | Estilo y reglas del ecosistema Expo en config flat | `package.json`; `eslint.config.js` |

## Razones

- **Ecosistema móvil multiplataforma:** React Native cubre Android e iOS con un mismo código base, requisito implícito del proyecto móvil de campus en el que las pantallas se prueban en dispositivos y emuladores.
- **Tipado estricto:** TypeScript 6.0.3 con `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` (tsconfig) da seguridad al trabajo concurrente del equipo sobre las capas y contratos (modelos, puertos, casos de uso).
- **Reproducibilidad del entorno:** las versiones están fijadas en `package.json` + `package-lock.json` (lockfile v3) y Node en `.nvmrc` (22.22.0) / `engines` (≥22.13); `make setup` instala con `npm ci` para reproducir exactamente el mismo árbol de dependencias.
- **Tooling integrado:** Expo aporta el preset de Jest (`jest-expo`), el config de ESLint (`eslint-config-expo`) y la base de tsconfig (`expo/tsconfig.base`), además de `expo prebuild`, `expo run:*` y `expo export` para la generación del bundle Android usado por la evaluación.
- **Compatibilidad con las pruebas y evaluación de la Semana 2:** las pruebas públicas, el evaluador de la materia (`tools/course_public_evaluator.py`), los workflows de GitHub y `make feedback` están construidos sobre este stack; cambiarlo rompería la reproducción evaluada desde el SHA.
- **Alineación con la arquitectura por capas:** Expo/RN/TS soportan la separación UI–Application–Domain–Infrastructure de ADR-001: la UI consume contratos del dominio con inyección de dependencias en `App.tsx`, y las capas internas se prueban de forma aislada con Jest.

## Restricciones

- **Stack fijado por el curso:** no es una elección libre del equipo (`docs/assignments/week-02.md`).
- **Versiones que deben conservarse** para reproducibilidad: Expo SDK 57, React Native 0.86.2, TypeScript 6.0.3, React 19.2.3.
- **Node.js 22.22.0** según `.nvmrc`; `engines` exige `>=22.13` (`package.json`).
- **New Architecture activada:** `newArchEnabled: true` (`app.json`).
- **Configuración nativa documentada:** paquetes Android/iOS `mx.edu.dmi.engineeringapp` (`app.json`); para builds nativos se requieren JDK 17, Android Platform 35, Build Tools 35 y NDK 27.1.12297006 (README). Los proyectos `android/`/`ios/` se generan con `expo prebuild` (script `native:generate`), no se versionan en el repositorio.
- **Overrides de npm** que fijan Metro 0.84.5 para el plugin de comunidad (`package.json`, bloque `overrides`).

## Alternativas consideradas

Para esta decisión **no se evaluó formalmente ninguna alternativa de stack**. El curso establece React Native + Expo + TypeScript como requisito vinculante y la Semana 2 lo confirma explícitamente, por lo que el equipo no realizó una comparación tecnológica.

Cualquier otra opción (por ejemplo, otras plataformas de desarrollo móvil o un stack web móvil) queda **fuera del alcance de esta decisión** y no representa una evaluación realizada por el equipo.

## Consecuencias

### Positivas

- **Ecosistema común:** los tres integrantes trabajan sobre las mismas dependencias y herramientas, reduciendo fricción en los merges.
- **Reproducibilidad:** `npm ci` + `package-lock.json` + versiones fijadas permiten que la evaluación docente desde el SHA entregado obtenga el mismo entorno.
- **Integración de pruebas:** el preset `jest-expo` y `@testing-library/react-native` permiten probar pantallas y capas sin levantar dispositivos.
- **Tooling de Expo:** prebuild, `run:*`, export del bundle y config de tsconfig/ESLint ya vienen resueltos.
- **Compatibilidad con la evaluación:** typecheck, lint, smoke test, auditoría crítica y bundle Android (`make feedback`) están definidos sobre este stack.

### Negativas / costos

- **Menor libertad para cambiar versiones:** el repositorio debe conservar las versiones fijadas; actualizar librerías sin autorización compromete la reproducción evaluada.
- **Dependencia de las decisiones del curso:** los cambios de stack o versión quedan subordinados al encuadre del curso, no a la preferencia del equipo.
- **Complejidad del entorno RN/Expo/New Architecture:** requisitos nativos (JDK 17, Android SDK/NDK), prebuild y la implícita gestión de Metro a través de `overrides`.
- **Adaptación incrementada del equipo:** el tipado estricto (incluido `exactOptionalPropertyTypes`) añade fricción inicial en componentes y contratos.

## Trade-off

Se sacrifica la flexibilidad para cambiar libremente el stack a cambio de reproducibilidad, compatibilidad con la evaluación del curso y un entorno tecnológico común para el equipo. En concreto: el repositorio fija Expo SDK 57, React Native 0.86.2, TypeScript 6.0.3 y Node 22.22.0, y con ello garantiza que `make setup` + `make feedback` desde el SHA entregado reproduzcan el mismo proyecto que se califica. El equipo acepta no actualizar libremente dependencias u orientar el desarrollo hacia otros ecosistemas, a cambio de que todo el trabajo semanal (pruebas públicas, workflows, evaluador) funcione sin fricción. Este costo se amortiza cada semana: la arquitectura por capas de ADR-001 se desarrolla y verifica sobre un entorno estable.

## Verificación

Comandos reproducibles, basados en herramientas presentes en el repositorio:

```bash
npm ls expo react-native typescript       # confirma las versiones instaladas del stack
npx tsc --noEmit                          # script "typecheck": compilación estricta sin errores
npm run lint                              # script "lint": ESLint con eslint-config-expo
npm run test:smoke                        # Jest con preset jest-expo sobre course-tests/smoke.test.tsx
```

Revisión manual de configuración que respalda la decisión:

- `package.json`: versiones de expo, react-native, typescript, react, scripts y bloque `jest`.
- `package-lock.json` (lockfile v3): árbol de dependencias fijado para `npm ci`.
- `tsconfig.json`: extiende `expo/tsconfig.base` y activa `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `app.json`: `newArchEnabled`, paquetes nativos, orientación y UI style.
- `.nvmrc` / `tools`: versión de Node 22.22.0 esperada.

## Relación con otros artefactos

- **ADR-001:** ADR-002 documenta el stack que ADR-001 ya declara como fijo; ambos comparten el estado "Aceptada — Semana 2" y el ADR-001 delega en este registro la justificación tecnológica.
- **docs/architecture.mmd:** el diagrama representa las capas y los tres perfiles de usuario sobre este stack; RN/Expo/TS son el soporte donde se materializan los límites de responsabilidad.
- **Estructura src/:** las capas UI–Application–Domain–Infrastructure y la inyección de dependencias en `App.tsx` se escriben en React Native + TypeScript, según las versiones fijadas aquí.
- **Evidencia de la Semana 2:** `evidence/week-02/engineering.json` describe la decisión de arquitectura verificada con Jest/tsc/madge; este ADR respalda el entorno en que esas verificaciones se ejecutan.