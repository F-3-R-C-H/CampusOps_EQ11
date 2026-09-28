import * as SecureStore from 'expo-secure-store';

import {
  MAX_SECURE_VALUE_BYTES,
  REFRESH_TOKEN_KEY,
  SESSION_TOKEN_KEY,
  SecureStorageError,
  clearSecureSession,
  getRefreshToken,
  getSessionToken,
  saveRefreshToken,
  saveSessionToken,
} from '../infrastructure/security/secureStorage';

const mockStore = new Map<string, string>();

// jest.mock se eleva automáticamente por encima de los imports.
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('secureStorage', () => {
  test('guarda y lee sessionToken y refreshToken', async () => {
    await saveSessionToken('sintetico-session');
    await saveRefreshToken('sintetico-refresh');
    expect(await getSessionToken()).toBe('sintetico-session');
    expect(await getRefreshToken()).toBe('sintetico-refresh');
    expect(mockStore.has(SESSION_TOKEN_KEY)).toBe(true);
    expect(mockStore.has(REFRESH_TOKEN_KEY)).toBe(true);
  });

  test('devuelve null si no hay token', async () => {
    expect(await getSessionToken()).toBeNull();
  });

  test('clearSecureSession elimina ambos tokens', async () => {
    await saveSessionToken('a');
    await saveRefreshToken('b');
    await clearSecureSession();
    expect(await getSessionToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  test('rechaza tokens vacíos', async () => {
    await expect(saveSessionToken('   ')).rejects.toBeInstanceOf(SecureStorageError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('rechaza tokens que exceden el límite sin exponer el valor', async () => {
    const big = 'x'.repeat(MAX_SECURE_VALUE_BYTES + 1);
    const err = await saveRefreshToken(big).catch((e: Error) => e);
    expect(err).toBeInstanceOf(SecureStorageError);
    expect((err as Error).message).not.toContain('xxxx');
  });

  test('si SecureStore falla, el error no contiene el token', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('boom token-secreto'));
    const err = await saveSessionToken('token-secreto').catch((e: Error) => e);
    expect(err).toBeInstanceOf(SecureStorageError);
    expect((err as Error).message).not.toContain('token-secreto');
  });

  test('clearSecureSession borra el otro token aunque uno falle', async () => {
    await saveRefreshToken('b');
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('fallo'));
    await expect(clearSecureSession()).rejects.toBeInstanceOf(SecureStorageError);
    expect(await getRefreshToken()).toBeNull();
  });
});