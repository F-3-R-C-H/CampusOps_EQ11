/**
 * Wrapper sobre `expo-secure-store` (Keychain en iOS / Keystore en Android)
 * para persistir tokens de sesión cifrados por el sistema operativo.
 *
 * Reglas:
 *  - Nunca se incluye el valor del token en mensajes de error ni en logs.
 *  - SecureStore admite valores pequeños (~2 KB): se valida el tamaño antes
 *    de guardar para fallar de forma explícita y segura.
 */
import * as SecureStore from 'expo-secure-store';

export const SESSION_TOKEN_KEY = 'campusops.sessionToken';
export const REFRESH_TOKEN_KEY = 'campusops.refreshToken';

/** Límite conservador de SecureStore (bytes UTF-8). */
export const MAX_SECURE_VALUE_BYTES = 2048;

export class SecureStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureStorageError';
  }
}

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function assertValidToken(kind: string, token: string): void {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new SecureStorageError(`${kind} no puede estar vacío`);
  }
  if (utf8ByteLength(token) > MAX_SECURE_VALUE_BYTES) {
    throw new SecureStorageError(
      `${kind} excede el límite de ${MAX_SECURE_VALUE_BYTES} bytes de almacenamiento seguro`,
    );
  }
}

async function save(key: string, kind: string, token: string): Promise<void> {
  assertValidToken(kind, token);
  try {
    await SecureStore.setItemAsync(key, token, STORE_OPTIONS);
  } catch {
    // Se descarta el error original: podría contener el valor guardado.
    throw new SecureStorageError(`No se pudo guardar ${kind} en almacenamiento seguro`);
  }
}

async function read(key: string, kind: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, STORE_OPTIONS);
  } catch {
    throw new SecureStorageError(`No se pudo leer ${kind} del almacenamiento seguro`);
  }
}

async function remove(key: string, kind: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, STORE_OPTIONS);
  } catch {
    throw new SecureStorageError(`No se pudo eliminar ${kind} del almacenamiento seguro`);
  }
}

export const saveSessionToken = (token: string): Promise<void> =>
  save(SESSION_TOKEN_KEY, 'sessionToken', token);
export const getSessionToken = (): Promise<string | null> =>
  read(SESSION_TOKEN_KEY, 'sessionToken');
export const deleteSessionToken = (): Promise<void> =>
  remove(SESSION_TOKEN_KEY, 'sessionToken');

export const saveRefreshToken = (token: string): Promise<void> =>
  save(REFRESH_TOKEN_KEY, 'refreshToken', token);
export const getRefreshToken = (): Promise<string | null> =>
  read(REFRESH_TOKEN_KEY, 'refreshToken');
export const deleteRefreshToken = (): Promise<void> =>
  remove(REFRESH_TOKEN_KEY, 'refreshToken');

/** Limpia por completo la sesión segura (usar en logout). */
export async function clearSecureSession(): Promise<void> {
  // allSettled: si falla uno, el otro token se borra igualmente.
  const results = await Promise.allSettled([deleteSessionToken(), deleteRefreshToken()]);
  if (results.some((r) => r.status === 'rejected')) {
    throw new SecureStorageError('No se pudo limpiar completamente la sesión segura');
  }
}
