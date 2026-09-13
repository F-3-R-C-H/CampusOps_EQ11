# ADR-004 — Estructura de carpetas y reglas de imports/dependencias (Semana 2)

## Estado

Aceptada — Semana 2

## Contexto

ADR-001 define la separación interna de CampusOps como `UI → Application → Domain ← Infrastructure` y ADR-003 dispone que los datos sintéticos viven en Infrastructure detrás del contrato de Domain (`IIncidenciaRepository`). Falta fijar la estructura física de `src/` y las reglas concretas de imports para que esa separación sea comprobable: los criterios AC-02 y AC-03 exigen que ADR, diagrama, imports y código describan la misma solución.

Dato verificado del repositorio: no existen aliases de rutas ni reglas automáticas de import boundaries; todos los imports son relativos y la verificación de dependencias se hace manualmente (madge ad hoc, reportado en `reports/week-02/dependencies.json`) y con typecheck.

## Alternativas consideradas

### Alternativa A — Estructura plana por tipo técnico (sin capas)

Organizar `src/` por tipo técnico global (por ejemplo `components/`, `services/`, `utils/`), sin reflejar la separación de responsabilidades del ADR-001.

- Ventajas: menos carpetas y nombres cortos.
- Desventajas: la UI, la lógica y el acceso a datos conviven en familias de archivos; la regla de dependencia de ADR-001 no queda materializada en la estructura, y la regla prohibida UI → Infrastructure no sería detectable por ruta.

### Alternativa B — Estructura por capas (la implementada)

`src/domain/`, `src/application/`, `src/infrastructure/` y `src/ui/`, con `App.tsx` como raíz de composición.

- Ventajas: la regla de dependencia del ADR-001 se refleja en la estructura de carpetas; las rutas permiten verificar (o prohibir) imports por nombre de capa; es la estructura real que ya funciona en el repositorio.
- Desventajas: mayor profundidad de carpetas e imports relativos más largos.

## Decisión

Elegimos la **Alternativa B: estructura por capas**, con los nombres y archivos reales del repositorio. La separación física de `src/` coincide con la separación lógica de ADR-001, y `App.tsx` actúa como la única raíz de composición que conoce Infrastructure.

## Estructura real de `src/` (relevante)

```
src/
├── application/usecases/GetIncidencias.ts     # caso de uso: orquesta sobre el contrato de Domain
├── campusops/contracts.ts                     # vocabulario compartido (curso): estados, categorías, perfiles
├── domain/models/Incidencia.ts                # entidad pura del dominio
├── domain/ports/IIncidenciaRepository.ts      # contrato: getAll / getById
├── infrastructure/memory/IncidenciaMemoryRepo.ts # fake determinista que implementa el contrato (SEED_DATA)
├── ui/screens/ListaIncidencias.tsx            # pantalla de lista (presentación)
├── ui/screens/DetalleIncidencia.tsx           # pantalla de detalle (presentación)
```

Fuera de las cuatro capas internas quedan, además, `src/api/courseBackend.ts` (cliente de `/health` del backend de curso) y `src/course-evaluation/` (adaptadores de evaluación pendientes de semanas futuras). El punto de entrada `App.tsx` (raíz del proyecto) es la raíz de composición.

## Responsabilidades por capa

| Capa | Responsabilidad | Archivos actuales |
|---|---|---|
| **UI** | Pantallas React Native, presentación de datos y navegación por estado local | `src/ui/screens/ListaIncidencias.tsx`, `src/ui/screens/DetalleIncidencia.tsx` |
| **Application** | Casos de uso que orquestan la lógica sobre el contrato de Domain | `src/application/usecases/GetIncidencias.ts` |
| **Domain** | Modelos de negocio y puertos/contratos | `src/domain/models/Incidencia.ts`, `src/domain/ports/IIncidenciaRepository.ts` |
| **Infrastructure** | Implementaciones concretas de los contratos | `src/infrastructure/memory/IncidenciaMemoryRepo.ts` |

## Reglas de imports/dependencias

Reglas permitidas, tal como se verifica en los imports reales del repositorio:

- **UI → Application:** las pantallas importan `GetIncidencias` (`ListaIncidencias.tsx:12`, `DetalleIncidencia.tsx:12`).
- **UI → Domain (tipos):** las pantallas importan `Incidencia` y `IIncidenciaRepository` (`src/domain/models/Incidencia`, `src/domain/ports/IIncidenciaRepository`).
- **Application → Domain:** `GetIncidencias.ts:8-9` importa sólo Domain.
- **Infrastructure → Domain:** `IncidenciaMemoryRepo.ts:9-10` importa el modelo y el contrato que implementa.
- **Domain → `src/campusops/contracts.ts`:** `Incidencia.ts:8` usa el vocabulario compartido del curso.
- **`App.tsx` → Infrastructure y UI:** `App.tsx:13-15` importa `IncidenciaMemoryRepo` y las pantallas; es la raíz de composición.

Regla prohibida (verificada):

- **UI → Infrastructure directo:** ninguna pantalla importa `infrastructure/`. El único archivo del proyecto que cruza hacia `infrastructure/memory/IncidenciaMemoryRepo` es `App.tsx:13`. La violación de esta regla es detectable y fue la registrada en el caso de falla AC-03 (`reports/week-02/dependencies.json`).
- Por coherencia de la regla de dependencia, tampoco Application ni Infrastructure importan UI, y Domain no conoce Application ni Infrastructure.

Todos los imports son **relativos** (`../../...`); no hay `baseUrl` ni `paths` en `tsconfig.json`, por lo que no existen aliases. No hay reglas automáticas de import boundaries en ESLint: el único config es `eslint.config.js` con `eslint-config-expo/flat` (sin `no-restricted-imports` ni plugin de boundaries). La verificación de imports se hace de forma manual/semicompleja: `npx tsc --noEmit` y madge ad hoc, no como parte de un script de calidad.

## Excepciones a la regla de capas

1. **Domain → `src/campusops/contracts.ts`:** `Incidencia.ts:8` importa desde el vocabulario compartido que provee el curso (estados, categorías, perfiles). Es un paquete ajeno al esquema interno de capas, de solo tipos.
2. **`App.tsx` → Infrastructure como raíz de composición:** `App.tsx` crea `new IncidenciaMemoryRepo()` (App.tsx:19) y lo inyecta a las pantallas como `IIncidenciaRepository`. Se sitúa fuera de las cuatro capas internas y es el punto único donde se conoce la implementación concreta.
3. **`src/api/` y `src/course-evaluation/` fuera de las cuatro capas:** `src/api/courseBackend.ts` sólo expone la salud del backend de curso; `src/course-evaluation/` contiene adaptadores pendientes (stubs que lanzan error) para la calificación de semanas futuras. Ninguno participa en el flujo de incidencias de la Semana 2.

## Consecuencias

### Positivas

- **Límites comprobables por imports:** con la estructura por capas, la regla prohibida UI → Infrastructure se puede detectar (madge/tsc), como quedó demostrado en AC-03.
- **ADR, diagrama y código describen lo mismo:** la estructura física refleja los nombres `ui`, `application`, `domain`, `infrastructure` que valida la prueba pública de Semana 2.
- **Trabajo en equipo por capas:** los integrantes pueden trabajar en capas distintas sin pisar los archivos de otros (coherente con ADR-001).
- **Sustitución de proveedor localizada:** cambiar la implementación concreta afecta sólo a la composición de `App.tsx`.

### Negativas / costos

- **Mayor profundidad de carpetas e imports relativos largos** (`../../domain/...`, `../../infrastructure/...`).
- **Sin safeguard automático de imports:** no existe una regla de ESLint de boundaries ni un script de madge en `package.json`; la disciplina depende de la verificación ad hoc y de los reportes.
- **Adaptación del equipo:** se requiere entender la regla de dependencia para no introducir imports prohibidos.

## Trade-off

Se acepta una estructura más profunda con rutas relativas más largas a cambio de límites de capa explícitos y verificables, testabilidad y un costo de sustitución del proveedor confinado a la composición. El costo adicional de navegación se compensa porque permite detectar violaciones (como la del caso AC-03) y porque garantiza que ADR, diagrama, imports y código describan la misma arquitectura que la evaluación de la Semana 2 comprueba.

## Verificación

Mecanismos existentes en el repositorio:

- `npx tsc --noEmit` — compila con tipos estrictos y valida que los imports de cada capa resuelvan.
- `npx jest course-tests/public/week-02.test.ts --no-coverage` — prueba pública: valida los nodos `ui`/`application`/`domain`/`infrastructure` del diagrama, la ausencia de arista directa UI → Infrastructure y las palabras clave del ADR-001.
- `npx madge --extensions ts,tsx src/ui/screens/ListaIncidencias.tsx` — verificación ad hoc de imports (evidencia AC-03 en `reports/week-02/dependencies.json`).
- Inspección manual: revisar los imports de cada capa y de `App.tsx` (lista en este ADR).

## Relación con otros artefactos

- **ADR-001:** este ADR materializa su regla de dependencia (`UI → Application → Domain ← Infrastructure`) en carpetas y reglas de imports.
- **ADR-002:** la estructura se implementa sobre el stack fijado (React Native 0.86.2, Expo SDK 57, TypeScript 6.0.3) con TypeScript estricto y sin aliases.
- **ADR-003:** la estructura ubica los datos en `src/infrastructure/memory/IncidenciaMemoryRepo.ts` bajo el contrato de Domain que ADR-004 define como permitido (Infrastructure → Domain) y prohíbe que la UI lo conozca directamente.
- **`docs/architecture.mmd`:** el diagrama representa los mismos nodos y aristas que esta estructura; como matiz de coherencia documental detectado durante la auditoría, el diagrama dibuja un nodo `GetIncidenciaById UseCase` (architecture.mmd:13) mientras que el código implementa una sola clase `GetIncidencias` con `execute()` y `executeById()` (`src/application/usecases/GetIncidencias.ts`). Este matiz queda anotado aquí y no se corrige en este ADR.