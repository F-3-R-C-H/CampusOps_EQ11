# Resgitro de Riesgos - CampusOps

> Registren exactamente tres riesgos y ordénenlos del más al menos prioritario.

| Prioridad | Riesgo | Probabilidad | Impacto | Mitigación | Cómo comprobar la mitigación |
|---:|---|---|---|---|---|

| 1 | Conflictos de sincronización cuando un técnico atiende una incidencia sin conexión (campo `work`: asignado + estado) y el coordinador la reasigna al mismo tiempo desde otro dispositivo. 
| Alta — el backend ya contempla `baseVersion` y responde 409 ante versión obsoleta en `POST /v1/incidents/:id/actions`, es decir, el propio contrato asume que este choque va a ocurrir con frecuencia. 
| Alto — `resolveSync(base, local, remote)` debe combinar cambios independientes, pero un cambio distinto sobre el mismo campo (`work`) que se resuelva mal borra la reasignación o el diagnóstico de uno de los dos actores. 
| Que `resolveSync` reporte explícitamente el conflicto sobre `work` en vez de aplicar "el último que llega gana", y que la cola no se descarte al detectar el conflicto. 
| Simular edición concurrente del campo `work` (una local, una remota) y verificar que ninguna se pierde silenciosamente y que se reporta el conflicto en orden de nombre, como exige el contrato de semana 8. |

| 2 | Falta de idempotencia al reintentar `POST /v1/incidents` o `POST /v1/incidents/:id/actions` tras una respuesta perdida (escenario `timeout_after_commit`), generando registros duplicados. 
| Media — el contrato ya exige un `Idempotency-Key` estable justo porque este escenario es esperado, aunque no ocurre en cada sincronización. 
| Medio — sin `deduplicateOperations` conservando la primera operación por `operationId`, el historial de la incidencia queda con entradas repetidas que confunden al coordinador. 
| Rechazar/fusionar en el servidor los reenvíos con el mismo `Idempotency-Key` (409 si el contenido difiere) y aplicar `deduplicateOperations` del lado del cliente antes de sincronizar la cola. 
| Forzar el escenario `timeout_after_commit` con `X-Course-Scenario`, reenviar la misma operación y confirmar que el historial final tiene una sola entrada, no dos. 

| 3 | Un actor ejecuta una acción reservada a otro rol (ej. un técnico cierra un caso, o actúa sobre una incidencia no asignada a él) porque el backend confía en el rol enviado por el cliente en vez de validarlo. 
| Baja — el contrato es explícito en que "ninguna app real debe confiar en un rol enviado por el cliente" y ya define 403 para "rol/asignación incompatible", así que requiere un descuido concreto en el adaptador para exponerse. 
| Alto — compromete la integridad del historial de incidencias, ya que una acción quedaría atribuida a quien no tenía autoridad real para tomarla. 
| Validar rol y asignación en el backend en cada acción (no solo ocultar el botón en la interfaz), devolviendo 403 ante incompatibilidad, y probar también `reducePermissionLifecycle` para revocación de permisos. 
| Enviar `X-Course-Actor: technician-1` intentando una acción de coordinador (ej. `close` sobre una incidencia no asignada a ese técnico) y confirmar que el servidor responde 403 en vez de ejecutar la acción. |

## Riesgo que atenderíamos primero

Atenderíamos primero el riesgo de **conflictos de sincronización offline-first** porque combina probabilidad alta e impacto alto: el propio backend ya anticipa este choque con `baseVersion` y respuestas 409, así que no es un caso extremo sino parte central del diseño. Si `resolveSync` lo resuelve mal, se pierde el tipo de dato más costoso de recuperar (el diagnóstico de campo de un técnico o la decisión de asignación del coordinador), rompiendo la trazabilidad que le da sentido a todo el historial de incidencias. Los otros dos riesgos son relevantes, pero su impacto es más contenible: los duplicados se pueden depurar con `deduplicateOperations`, y un fallo de permisos, aunque grave si ocurre, requiere un descuido más específico dado que el contrato ya define 403 explícitamente.