# Definición del problema — CampusOps

## Problema

En el campus universitario ficticio, estudiantes y personal detectan fallas e incidencias de infraestructura: fallas eléctricas, daños en laboratorios, fugas de agua, problemas de conectividad, equipos descompuestos, riesgos de seguridad y necesidades de mantenimiento. Hoy esa atención está dispersa: no existe un canal único donde quien detecta la falla pueda registrarla con categoría, descripción, ubicación y evidencia, darle seguimiento y ver su estado, ni donde el personal responsable pueda ver el conjunto, decidir quién la atiende, verificar la resolución y conservar el historial.

CampusOps atiende a dos tipos de usuarios del campus: quienes **reportan** (estudiantes y personal) y quienes **responden** (técnicos y coordinador). Importa porque, sin un registro central, las incidencias pueden quedar sin responsable claro, duplicarse los reportes o perderse su historial, lo que alarga el tiempo de atención y dificulta la rendición de cuentas.

## Alcance

### Incluye

- Registrar incidencias con categoría, descripción, ubicación y evidencia.
- Consultar y dar seguimiento al estado de una incidencia.
- Priorizar, asignar o reasignar técnicos desde la coordinación.
- Atender con diagnóstico, notas y evidencia, y solicitar la verificación de la resolución.
- Verificar la resolución por coordinación y cerrarla o reabrirla, conservando el historial.
- Operación offline-first: consulta local, cola persistente de cambios que sobrevive al reinicio, sincronización con detección de conflictos e idempotencia en los reintentos.
- Permisos por perfil y registros técnicos sanitizados, sin datos sensibles.

### No incluye

- Pagos, chat en tiempo real ni panel web administrativo completo.
- IA para reconocimiento de imágenes.
- Publicación obligatoria en tiendas.
- Datos, ubicaciones, fotografías o personas reales: sólo el campus ficticio con cuentas, ubicaciones y material de prueba.
- Integración con sistemas institucionales reales.

## Actores y responsabilidades

- **Reportante (estudiante o personal del campus):** crea incidencias, agrega evidencia y consulta sus reportes.
- **Técnico:** consulta sus asignaciones, atiende la incidencia, registra diagnóstico y evidencias, marca la resolución y solicita la verificación; en zonas sin conexión, sus cambios quedan en la cola local y se sincronizan después.
- **Coordinador:** consulta el conjunto, prioriza, asigna o reasigna técnicos, verifica las resoluciones y sus evidencias, y cierra o reabre incidencias.

## Flujo principal

1. **Reportar:** el reportante registra la incidencia con categoría, descripción, ubicación y evidencia; queda en estado `open`.
2. **Asignar:** el coordinador revisa el conjunto, prioriza y asigna la incidencia a un técnico; pasa a `assigned`.
3. **Atender:** el técnico inicia la atención (`in_progress`), registra diagnóstico y evidencias y, al terminar, solicita la verificación de la resolución (`resolved`).
4. **Verificar:** el coordinador revisa la resolución y las evidencias antes de cerrar.
5. **Cerrar:** el coordinador cierra la resolución (`closed`), o la reabre a `assigned` si hace falta.

Cada cambio de estado conserva el historial.

## Criterios de aceptación verificables

1. Dado que un reportante registra una incidencia con categoría, descripción, ubicación y evidencia, cuando se guarda, entonces la incidencia queda en estado `open`, aparece en la lista consultable y el reportante puede verla desde su perfil.
2. Dado que una incidencia está en `open`, cuando el coordinador la prioriza y la asigna a un técnico, entonces pasa a `assigned`, aparece en la lista de incidencias asignadas de ese técnico y el cambio queda en el historial.
3. Dado que una incidencia está asignada, cuando el técnico inicia la atención y registra su diagnóstico y evidencias, entonces pasa a `in_progress`; al terminar, la marca como `resolved` y solicita la verificación.
4. Dado que una incidencia está en `resolved`, cuando el coordinador verifica la resolución y las evidencias, entonces la cierra (`closed`) o la reabre a `assigned` si determina que falta algo.
5. Dado que un técnico registra cambios sin conexión (cambios de estado, notas o evidencias), cuando se sincroniza con el servidor, entonces los cambios pendientes se conservan, se aplican una sola vez sin duplicar eventos y se informa si existe un conflicto por reasignación.
6. Dado que un reportante o técnico ejecuta operaciones según su perfil, entonces sólo el perfil correspondiente puede realizarlas y los registros técnicos no exponen datos sensibles.
