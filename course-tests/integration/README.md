# Integración local del cliente de incidencias — Semana 05

Esta prueba levanta `course-backend/server.mjs` en un puerto dinámico y ejercita `CourseHttpClient` junto con `IncidenciaApiRepository`. Usa un `FetchLike` basado en `node:http` para realizar HTTP real sin depender del `global.fetch` sustituido por Jest ni de Internet público.

## Predicción registrada antes de ejecutar

Registrada el `2026-10-05T04:01:16.705Z`: se espera que `success` produzca una lista utilizable, `nullable` conserve el recurso como payload ausente, `malformed` produzca `invalid_json`, `slow` venza el timeout del cliente y `server_error` conserve HTTP 500 con el código técnico `controlled_failure`.

## Comando

```bash
npm test -- --ci --runInBand course-tests/integration/week-05-client-local.test.ts
```

## Resultado observado

`PASS`: 1 suite y 1 prueba aprobadas, 0 snapshots. Jest informó `3.026 s`; el caso de integración informó `188 ms`. Los cinco escenarios produjeron los resultados previstos.

La prueba termina el proceso local en `afterAll`, incluso cuando una expectativa falla. No implementa ni comprueba creación o idempotencia.
