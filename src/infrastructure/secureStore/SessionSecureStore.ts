/**
 * Infrastructure: SessionSecureStore
 *
 * Envoltorio sobre `expo-secure-store` para persistir el token de sesión.
 * En iOS usa Keychain y en Android usa Keystore: el valor queda cifrado
 * por el sistema operativo, no en texto plano.
 *
 * IMPORTANTE (Semana 4 — auditoría de seguridad):
 * Este módulo existe para que, cuando se implemente el login (semanas
 * 5-6), NADIE en el equipo tenga que decidir "¿dónde guardo el token?"
 * y termine usando AsyncStorage por comodidad. AsyncStorage guarda los
 * datos sin cifrar, en texto plano, en el almacenamiento del dispositivo,
 * legible por cualquier proceso con acceso a ese almacenamiento.
 *
 * Requiere: `npx expo install expo-secure-store`
 */
import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'campusops.session.accessToken';

export const SessionSecureStore = {
  async saveToken(token: string): Promise<void> {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('saveToken requiere un token no vacío');
    }
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  },

  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  },

  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  },
};
