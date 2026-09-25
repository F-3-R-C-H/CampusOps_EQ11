jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { SessionSecureStore } from './SessionSecureStore';

describe('SessionSecureStore (Semana 4 — Hallazgo 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('guarda el token usando expo-secure-store (cifrado por el SO), no en una variable ni AsyncStorage', async () => {
    await SessionSecureStore.saveToken('demo-token-123');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('campusops.session.accessToken', 'demo-token-123');
  });

  test('rechaza guardar un token vacío', async () => {
    await expect(SessionSecureStore.saveToken('')).rejects.toThrow();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('lee el token a través de expo-secure-store, no de un valor en memoria', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('demo-token-123');
    const token = await SessionSecureStore.getToken();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('campusops.session.accessToken');
    expect(token).toBe('demo-token-123');
  });

  test('borra el token al cerrar sesión', async () => {
    await SessionSecureStore.clearToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('campusops.session.accessToken');
  });
});
