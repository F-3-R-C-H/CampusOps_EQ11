/**
 * Logger seguro — Semana 04: Seguridad y Privacidad.
 *
 * Aplica redactForTelemetry a todo contexto antes de registrarlo,
 * garantizando que tokens, correos, ubicaciones e IDs personales
 * no aparezcan en ninguna traza técnica.
 *
 * Solo emite en entornos de desarrollo (__DEV__). En producción,
 * aquí se conectaría un servicio de telemetría externo que también
 * reciba el contexto ya sanitizado.
 */
import { redactForTelemetry } from '../../course-evaluation';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: unknown;
}

function buildEntry(level: LogLevel, message: string, context?: unknown): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    // El contexto siempre pasa por el sanitizador antes de almacenarse o emitirse.
    ...(context !== undefined ? { context: redactForTelemetry(context) } : {}),
  };
}

function emit(entry: LogEntry): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const line = JSON.stringify(entry);
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export function logDebug(message: string, context?: unknown): void {
  emit(buildEntry('debug', message, context));
}

export function logInfo(message: string, context?: unknown): void {
  emit(buildEntry('info', message, context));
}

export function logWarn(message: string, context?: unknown): void {
  emit(buildEntry('warn', message, context));
}

/**
 * Registra un error técnico. Si se pasa un objeto Error, se extrae solo
 * el tipo y el mensaje normalizado — nunca el stack completo, que puede
 * incluir valores de variables sensibles interpolados por el runtime.
 */
export function logError(message: string, error?: unknown, context?: unknown): void {
  const safeError =
    error instanceof Error
      ? { errorName: error.name, errorMessage: error.message }
      : undefined;

  const merged =
    safeError !== undefined || context !== undefined
      ? { ...safeError, ...(context !== undefined ? (context as object) : {}) }
      : undefined;

  emit(buildEntry('error', message, merged));
}
