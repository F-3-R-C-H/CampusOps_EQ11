# ADR-001 — Arquitectura Interna de CampusOps

## Estado

Aceptada — Semana 2

## Contexto

CampusOps es una aplicación móvil construida con React Native, Expo y TypeScript para la gestión de incidencias en un campus universitario. El proyecto involucra tres perfiles de usuario (ciudadano, técnico y coordinador), múltiples responsabilidades (incidencias, sesión, persistencia, ubicación) y la necesidad de sustituir proveedores a lo largo de 13 semanas de desarrollo incremental.

En la Semana 2 necesitamos definir cómo separar responsabilidades internas para que:
- La interfaz de usuario no dependa directamente de los proveedores de datos.
- Los componentes de dominio puedan probarse de forma aislada.
- Un cambio de proveedor (por ejemplo, pasar de datos en memoria a una API REST) no requiera modificar la UI ni la lógica de negocio.

El stack tecnológico (React Native, Expo, TypeScript) ya está fijado por el curso y no forma parte de esta decisión.

## Alternativas Consideradas

### Alternativa A — Arquitectura por Capas (Clean Architecture simplificada)

Organizar el código en cuatro capas con dependencias dirigidas:

```
UI  →  Application  →  Domain  ←  Infrastructure
```

| Capa | Responsabilidad |
|---|---|
| **UI** | Pantallas React Native, navegación, presentación de datos |
| **Application** | Casos de uso que orquestan la lógica; dependen solo del contrato del dominio |
| **Domain** | Modelos de negocio, reglas, interfaces/puertos que definen qué necesita la app |
| **Infrastructure** | Implementaciones concretas: fake en memoria (Semana 2), API REST, almacenamiento local |

Regla de dependencia: las capas internas (Domain) no conocen las externas. Infrastructure implementa los contratos definidos en Domain pero nunca es importada directamente por UI.

**Ventajas:**
- Alta testabilidad: Domain y Application son funciones puras, sin dependencias de framework.
- Cambio de proveedor casi gratuito: sustituir `IncidenciaMemoryRepo` por `IncidenciaApiRepo` solo requiere cambiar la inyección, sin tocar UI ni casos de uso.
- Límites claros para trabajo en equipo: cada integrante puede trabajar en una capa sin conflictos.

**Desventajas:**
- Requiere definir interfaces/puertos desde el inicio, antes de tener funcionalidad real.
- Más archivos y carpetas que una solución directa.
- Curva de aprendizaje moderada para quienes no han usado el patrón.

### Alternativa B — Organización por Feature Modules (Monolítica por funcionalidad)

Organizar el código agrupando todo lo relacionado a una funcionalidad en una sola carpeta:

```
src/
├── incidencias/
│   ├── ListaScreen.tsx
│   ├── DetalleScreen.tsx
│   ├── incidenciaService.ts    (lógica + datos)
│   └── types.ts
├── sesion/
│   └── ...
```

Cada módulo de feature contiene UI, lógica y acceso a datos juntos.

**Ventajas:**
- Fácil de entender para desarrolladores frontend: todo lo de "incidencias" vive en una carpeta.
- Menos archivos iniciales.
- Localidad: un cambio en incidencias no toca la carpeta de sesión.

**Desventajas:**
- El servicio mezcla lógica de negocio con acceso a datos, dificultando las pruebas unitarias.
- Cambiar de proveedor (ej. pasar de datos en memoria a API) requiere modificar el servicio que la UI importa directamente.
- No hay un contrato claro que permita sustituir la implementación sin afectar a los consumidores.
- Riesgo de acoplar UI con detalles de infraestructura conforme crece el proyecto.

## Decisión

Elegimos la **Alternativa A: Arquitectura por Capas (Clean Architecture simplificada)**.

## Razones

1. **Facilidad de prueba (testabilidad):** El dominio y los casos de uso pueden probarse sin levantar React Native, Expo ni ningún proveedor real. Se pasa un fake que cumple el contrato y se verifica la lógica pura.
2. **Cambio de proveedor a bajo costo:** En la Semana 2 usamos un repositorio en memoria; en la Semana 5 conectaremos el backend REST. Con los puertos definidos, el cambio afecta solo a `infrastructure/`, sin tocar `ui/` ni `application/`.
3. **Separación clara para el equipo:** Tres integrantes pueden trabajar en capas distintas (Fernando en domain/application, Danna documenta decisiones, Tonantzin revisa coherencia y diagrama) sin generar conflictos de merge.
4. **Alineación con los criterios de evaluación:** Los criterios AC-02 y AC-03 exigen que ADR, diagrama, imports y código describan la misma separación UI–Application–Domain–Infrastructure. La Alternativa A mapea directamente a estos nombres.

## Consecuencias

### Positivas
- El modelo de dominio (`Incidencia`, sus estados y reglas) se prueba sin dependencias externas.
- Sustituir el fake en memoria por una implementación real (API, almacenamiento local) tiene costo cercano a cero: se cambia la inyección, no la UI.
- Las pruebas de arquitectura (como la verificación de imports) pasan de forma natural si se respeta la regla de dependencia.

### Negativas
- Se requiere definir interfaces (`IIncidenciaRepository`) aunque la primera implementación sea un simple fake.
- La estructura de carpetas es más profunda que la Alternativa B.
- Los integrantes deben comprender la regla de dependencia para no introducir imports prohibidos (ej. UI importando directamente desde infrastructure).

## Trade-off

La facilidad de prueba y la capacidad de cambiar proveedores sin refactoring justifican la complejidad estructural inicial. El equipo acepta el costo de más archivos y una curva de aprendizaje moderada a cambio de evitar refactorizaciones costosas en las semanas 5 a 9, cuando se integren el backend, la persistencia local y los servicios de ubicación. El diagrama y las pruebas de imports sirven como red de seguridad para mantener los límites a lo largo del semestre.
