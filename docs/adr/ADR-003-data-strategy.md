# ADR-003 — Estrategia de datos para incidencias (Semana 2)

## Estado

Aceptada — Semana 2

## Contexto

CampusOps necesita mostrar en esta semana la lista y el detalle de incidencias usando datos sintéticos: todavía no existe un backend real de incidencias (el único cliente de red del repositorio, `src/api/courseBackend.ts`, sólo consulta `/health` del backend de curso y no alimenta la lista). En `src/campusops/contracts.ts` existe el vocabulario compartido de estados y categorías, pero no hay un proveedor de datos en producción.

La pregunta arquitectónica es dónde deben vivir esos datos y cómo debe acceder la aplicación a ellos, sin acoplar la UI a una implementación concreta. La Semana 2 exige que el esqueleto permita sustituir componentes mediante sus interfaces (AC-02) y que las capas respeten la regla de dependencia de ADR-001 (UI → Application → Domain ← Infrastructure).

## Alternativas consideradas

### Alternativa A — Datos hardcodeados en la UI

Los datos vivirían directamente en las pantallas (o en constantes consumidas directamente por la UI), mezclando presentación con fuente de datos. En esta alternativa no existe una capa de datos: la UI es a la vez pantalla, fuente de verdad y responsable de la obtención.

Consecuencias de la alternativa A:
- Mayor acoplamiento entre la presentación y la fuente de datos: cambiar de dónde salen los datos implica reescribir la pantalla que los consume.
- Menor separación de responsabilidades: la pantalla combina render con lógica de obtención de datos.
- Sustitución futura del proveedor más costosa: no hay contrato ni puerto donde inyectar otra implementación.
- Menor capacidad para probar la obtención de datos de forma aislada: no existe una unidad de obtención separable de la UI.

### Alternativa B — Fake Repository en memoria detrás del contrato de Domain

Los datos sintéticos viven en Infrastructure y se consumen a través de un contrato definido en Domain, orquestado por Application. Implementación real del repositorio:

- `src/domain/ports/IIncidenciaRepository.ts` — contrato con `getAll(): Promise<Incidencia[]>` y `getById(id): Promise<Incidencia | null>`.
- `src/infrastructure/memory/IncidenciaMemoryRepo.ts` — `class IncidenciaMemoryRepo implements IIncidenciaRepository`, con los datos sintéticos en la constante `SEED_DATA` (7 incidencias `INC-001..INC-007` con IDs, estados y fechas `createdAt` fijas).
- `src/application/usecases/GetIncidencias.ts` — caso de uso que recibe `IIncidenciaRepository` por constructor y expone `execute()` (delega en `getAll`) y `executeById()` (delega en `getById`).
- `App.tsx` — raíz de composición: crea `new IncidenciaMemoryRepo()` y lo inyecta a las pantallas.
- `src/ui/screens/ListaIncidencias.tsx` y `src/ui/screens/DetalleIncidencia.tsx` — reciben el repositorio como prop tipada `IIncidenciaRepository`.

Flujo real documentado:

```
App.tsx
  → new IncidenciaMemoryRepo()
  → IIncidenciaRepository (inyectado como prop a las pantallas)
  → ListaIncidencias / DetalleIncidencia reciben el repositorio
  → new GetIncidencias(repository)
  → execute() / executeById(id)
  → estado de la pantalla (setState)
  → render
```

## Decisión

Elegimos la **Alternativa B**. Los datos sintéticos viven en Infrastructure mediante `IncidenciaMemoryRepo`, que implementa el contrato `IIncidenciaRepository` definido en Domain.

La UI no importa directamente Infrastructure: las pantallas sólo conocen el tipo `IIncidenciaRepository` y el caso de uso `GetIncidencias`, y la composición de la implementación concreta ocurre en `App.tsx`.

## Razones

1. **Separación de responsabilidades:** cada capa hace una sola cosa: Domain define modelo y contrato, Application orquesta, Infrastructure provee los datos, UI presenta. El `SEED_DATA` no toca las pantallas.
2. **Testabilidad:** `GetIncidencias` depende del contrato `IIncidenciaRepository`, por lo que la obtención de datos puede probarse con fakes sin levantar React Native, Expo ni un servidor.
3. **Determinismo de los datos:** `SEED_DATA` usa IDs, categorías, estados y fechas `createdAt` fijas (`IncidenciaMemoryRepo.ts`), lo que hace las pruebas y reportes repetibles.
4. **Independencia de red/backend:** no existe backend real de incidencias; el fake provee los datos sin conexión de red ni servidor.
5. **Posibilidad de sustituir posteriormente el proveedor:** el comentario documentado en `IncidenciaMemoryRepo.ts` indica que en la Semana 5 se sustituirá por un adaptador API sin tocar UI ni Application; el cambio quedaría confinado a la inyección en `App.tsx`.
6. **Menor acoplamiento de la UI:** las pantallas importan sólo Domain (`Incidencia`, `IIncidenciaRepository`) y Application (`GetIncidencias`), verificado por el grafo de imports (sin referencias a `infrastructure/` en `src/ui/`).

Además, el contrato asíncrono (`getAll`/`getById` devuelven `Promise`) hace que la UI maneje estados de carga con `ActivityIndicator` (`ListaIncidencias.tsx:47-69`, `DetalleIncidencia.tsx:48-71`), lo que es compatible con un proveedor futuro real sin cambiar las pantallas.

## Restricciones

- **Los datos son sintéticos:** el `SEED_DATA` de `IncidenciaMemoryRepo.ts` es ficticio (filos de campus de ejemplo), sin credenciales ni información real.
- **Sólo operaciones de lectura:** el contrato expone `getAll` y `getById`; no existen operaciones de escritura implementadas esta semana. Las operaciones de escritura del vocabulario de `campusops/contracts.ts` no están implementadas.
- **Contrato asíncrono:** todas las operaciones devuelven `Promise`, por lo que la UI ya modela latencia y estados de carga aunque el fake sea en memoria.
- **No existe aún un backend real de incidencias:** `src/api/courseBackend.ts` sólo provee `/health` del backend de curso; no alimenta la lista de incidencias.
- **El fake es una solución específica de la Semana 2:** está pensado para desarrollo y pruebas sin backend real.

## Consecuencias

### Positivas

- **UI independiente de la implementación concreta del repositorio:** las pantallas dependen del contrato `IIncidenciaRepository`, no de `IncidenciaMemoryRepo`.
- **Datos deterministas:** lista y detalle muestran siempre el mismo conjunto fijo de incidencias en cada ejecución, lo que estabiliza pruebas y demos.
- **Pruebas más aisladas:** la obtención de datos se prueba contra el contrato sin involucrar la presentación.
- **Posibilidad de cambiar el proveedor posteriormente:** sustituir el fake por un adaptador real afecta sólo la composición en `App.tsx`.
- **Arquitectura compatible con las reglas de dependencias de Semana 2:** se cumple la regla UI → Application → Domain ← Infrastructure (sin aristas directas UI → Infrastructure).

### Negativas / costos

- **Más archivos y abstracciones que hardcodear datos:** un puerto, un modelo, un caso de uso, una implementación y la raíz de composición para una fuente de datos sencilla.
- **Existe un puerto, caso de uso y repositorio para una fuente de datos sencilla:** la estructura es más profunda que declarar arreglos en la pantalla.
- **Manejo de asincronía/loading en UI:** al modelar `Promise`, cada pantalla debe gestionar estados de carga y posible ausencia de datos (p. ej. "Incidencia no encontrada" en `DetalleIncidencia`).
- **El caso de uso actualmente se instancia dentro de las pantallas** (`ListaIncidencias.tsx:52` y `DetalleIncidencia.tsx:53` crean `new GetIncidencias(repository)` en su interior). Es la situación actual del código y no se corrige en este ADR.

## Trade-off

Se acepta mayor estructura y abstracción (puerto, caso de uso, repositorio fake e inyección desde `App.tsx`) a cambio de testabilidad, determinismo, separación de responsabilidades y un menor costo de sustitución del proveedor de datos. La inversión adicional en archivos se asume porque la obtención de datos queda desacoplada de la presentación, alineada con el mismo trade-off que ADR-001 justifica para cambiarlo al momento de integrar un proveedor real en semanas posteriores.

## Verificación

Comandos y mecanismos existentes en el repositorio:

- `npx tsc --noEmit` — verifica tipos estrictos (script `typecheck`) y que las capas se resuelven sin error.
- Prueba pública de Semana 2 — `npx jest course-tests/public/week-02.test.ts --no-coverage` valida nodos y aristas del diagrama y contenido del ADR-001.
- Verificación de dependencias/imports con Madge — `npx madge --extensions ts,tsx src/ui/screens/ListaIncidencias.tsx` confirma que la pantalla no depende de `infrastructure/`.
- Inspección de los contratos y repositorios — revisión de `src/domain/ports/IIncidenciaRepository.ts`, `src/infrastructure/memory/IncidenciaMemoryRepo.ts` y `App.tsx:19` para confirmar la composición.

## Relación con otros artefactos

- **ADR-001:** esta estrategia es la materialización de que Infrastructure implementa el contrato definido en Domain; `IncidenciaMemoryRepo implements IIncidenciaRepository` con la inyección en `App.tsx`.
- **ADR-002:** la estrategia está implementada sobre el stack fijado del proyecto (React Native 0.86.2, Expo SDK 57, TypeScript 6.0.3) con tipado estricto y Jest.
- **`docs/architecture.mmd`:** el diagrama representa las capas y sus dependencias dirigidas; el repositorio fake de incidencias vive en los límites Domain/Infrastructure que el diagrama documenta.
- **Estructura real de `src/`:** los datos están en `src/infrastructure/memory/`, el contrato en `src/domain/ports/`, la orquestación en `src/application/usecases/` y la presentación en `src/ui/screens/`.