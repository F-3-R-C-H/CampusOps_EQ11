/* eslint-disable no-unused-vars */
/**
 * auth-sim.js
 * Simulación standalone del comportamiento de sesión de CampusOps_EQ11.
 * NO modifica ningún archivo del proyecto original.
 *
 * Refleja fielmente CourseHttpClient.ts (semana 05):
 *   - Token fijo en header Authorization (línea 68 del cliente real)
 *   - Sin interceptor de 401 implementado (no existe en el repo)
 *   - Sin mutex alrededor del refresh (no existe en el repo)
 *   - clearSecureSession() desde secureStorage.ts simula el logout
 */

// ─── Estado simulado de sesión ────────────────────────────────────────────────
let accessToken  = 'INVALID_ACCESS_TOKEN';
let refreshToken = 'VALID_REFRESH_TOKEN';   // cambia por INVALID en Caso B

let refreshCallCount = 0;
let logLines = [];

// ─── Utilidades de log ────────────────────────────────────────────────────────
function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function log(tag, msg) {
  const line = `[${ts()}] [${tag}] ${msg}`;
  logLines.push(line);
  const el = document.getElementById('log');
  if (el) {
    el.textContent += line + '\n';
    el.scrollTop = el.scrollHeight;
  }
  console.log(line);
}

function clearLog() {
  logLines = [];
  refreshCallCount = 0;
  const el = document.getElementById('log');
  if (el) el.textContent = '';
  document.getElementById('refresh-count').textContent = '0';
}

// ─── Simulación de fetch con latencia ─────────────────────────────────────────
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Simula la llamada HTTP.
 * - Si el accessToken es inválido → responde 401
 * - Si es válido → responde 200
 */
async function simulatedFetch(path, token) {
  await delay(120 + Math.random() * 80); // latencia de red simulada
  if (token === 'INVALID_ACCESS_TOKEN') {
    return { status: 401, ok: false };
  }
  return { status: 200, ok: true, data: { id: path, result: 'ok' } };
}

/**
 * Simula el endpoint POST /auth/refresh.
 * - refreshToken válido  → devuelve nuevo accessToken
 * - refreshToken inválido → lanza 401
 */
async function simulatedRefresh(rt) {
  await delay(200 + Math.random() * 100);
  if (rt === 'VALID_REFRESH_TOKEN') {
    return { ok: true, newAccessToken: 'NEW_VALID_ACCESS_TOKEN_' + Date.now() };
  }
  return { ok: false, status: 401 };
}

/** Limpia la sesión (equivale a clearSecureSession() del proyecto real). */
async function clearSecureSession() {
  accessToken  = null;
  refreshToken = null;
  await delay(10);
}

// ─── Interceptor SIN mutex (replica el estado actual del proyecto real) ───────
/**
 * requestWithRefresh:
 *   1. Envía la petición con el accessToken actual.
 *   2. Si recibe 401 → intenta refresh (SIN mutex → N operaciones disparan N refreshes).
 *   3. Si el refresh falla → llama a logout y lanza error.
 *   4. Si el refresh tiene éxito → reintenta la petición original.
 */
async function requestWithRefresh(opTag, path) {
  log(opTag, `REQUEST  → ${path}  (token: ${accessToken?.slice(0, 20)}…)`);

  let result = await simulatedFetch(path, accessToken);

  if (result.status === 401) {
    log(opTag, `401 recibido — iniciando refresh`);
    log('AUTH', `REFRESH START  (disparado por ${opTag}) — total disparos: ${++refreshCallCount}`);
    document.getElementById('refresh-count').textContent = String(refreshCallCount);

    const refreshResult = await simulatedRefresh(refreshToken);

    if (refreshResult.ok) {
      accessToken = refreshResult.newAccessToken;
      log('AUTH', `REFRESH OK — nuevo token: ${accessToken.slice(0, 30)}…`);
      log(opTag, `RETRY  → ${path}`);
      result = await simulatedFetch(path, accessToken);
      log(opTag, `RESPONSE ${result.status} — ${result.ok ? 'éxito' : 'fallo'}`);
    } else {
      log('AUTH', `REFRESH FAILED (${refreshResult.status}) — ejecutando logout`);
      await clearSecureSession();
      log('AUTH', `LOGOUT completado — sesión limpiada`);
      log(opTag, `ABORTADO — sesión cerrada`);
      result = { status: 401, ok: false, aborted: true };
    }
  } else {
    log(opTag, `RESPONSE ${result.status} — ${result.ok ? 'éxito' : 'fallo'}`);
  }

  return result;
}

// ─── Caso A: accessToken inválido + refreshToken VÁLIDO ───────────────────────
async function runCaseA() {
  clearLog();
  accessToken  = 'INVALID_ACCESS_TOKEN';
  refreshToken = 'VALID_REFRESH_TOKEN';

  log('SIM', '══ CASO A — accessToken inválido + refreshToken VÁLIDO ══');
  log('SIM', 'Lanzando 3 operaciones concurrentes con Promise.all…');

  const results = await Promise.all([
    requestWithRefresh('A', '/v1/incidents'),
    requestWithRefresh('B', '/v1/incidents/INC-001'),
    requestWithRefresh('C', '/v1/incidents/INC-002'),
  ]);

  log('SIM', `── Resultados finales ──`);
  results.forEach((r, i) => {
    const tag = ['A','B','C'][i];
    log('SIM', `  Op[${tag}] → status=${r.status} ok=${r.ok}`);
  });
  log('SIM', `Total llamadas a refresh: ${refreshCallCount}  (esperado sin mutex: 3)`);
  log('SIM', '══ FIN CASO A ══');
}

// ─── Caso B: accessToken inválido + refreshToken INVÁLIDO ─────────────────────
async function runCaseB() {
  clearLog();
  accessToken  = 'INVALID_ACCESS_TOKEN';
  refreshToken = 'INVALID_REFRESH_TOKEN';

  log('SIM', '══ CASO B — accessToken inválido + refreshToken INVÁLIDO ══');
  log('SIM', 'Lanzando 3 operaciones concurrentes con Promise.all…');

  const results = await Promise.all([
    requestWithRefresh('A', '/v1/incidents'),
    requestWithRefresh('B', '/v1/incidents/INC-001'),
    requestWithRefresh('C', '/v1/incidents/INC-002'),
  ]);

  log('SIM', `── Resultados finales ──`);
  results.forEach((r, i) => {
    const tag = ['A','B','C'][i];
    log('SIM', `  Op[${tag}] → status=${r.status} ok=${r.ok} aborted=${!!r.aborted}`);
  });
  log('SIM', `Total llamadas a refresh: ${refreshCallCount}  (esperado sin mutex: 3)`);
  log('SIM', `Logout ejecutado: ${accessToken === null && refreshToken === null ? 'SÍ (3 veces)' : 'NO'}`);
  log('SIM', '══ FIN CASO B ══');
}
