import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCHEMA_VERSION = 2;
const VERSION_KEY = 'campusops:schema_version';
const INCIDENTS_KEY = 'campusops:incidents';
const QUEUE_KEY = 'campusops:offline_queue';

export async function getCurrentSchemaVersion(): Promise<number> {
  const raw = await AsyncStorage.getItem(VERSION_KEY);
  if (raw === null) return 0;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

interface MigrationSnapshot {
  incidents: string | null;
  queue: string | null;
  version: string | null;
}

export async function migrate(
  from: number,
  to: number,
  injectFail: boolean = false,
): Promise<'ok' | 'rolled_back'> {
  // Tomar snapshot completo antes de migrar
  const snapshot: MigrationSnapshot = {
    incidents: await AsyncStorage.getItem(INCIDENTS_KEY),
    queue: await AsyncStorage.getItem(QUEUE_KEY),
    version: await AsyncStorage.getItem(VERSION_KEY),
  };

  try {
    // Paso de migración ejemplo v1 -> v2: añadir campo 'category' si no existe
    const incidentsRaw = snapshot.incidents ?? '[]';
    const incidents = JSON.parse(incidentsRaw) as Record<string, unknown>[];

    const migrated = incidents.map((inc) => {
      if (Object.prototype.hasOwnProperty.call(inc, 'category') && inc.category !== undefined) {
        return { ...inc };
      }
      return {
        ...inc,
        category: 'maintenance',
      };
    });

    if (injectFail) {
      throw new Error('Falla inyectada para prueba de rollback');
    }

    // Aplicar migración
    await AsyncStorage.setItem(INCIDENTS_KEY, JSON.stringify(migrated));
    await AsyncStorage.setItem(VERSION_KEY, String(to));
    return 'ok';
  } catch {
    // ROLLBACK: restaurar snapshot completo
    if (snapshot.incidents === null) {
      await AsyncStorage.removeItem(INCIDENTS_KEY);
    } else {
      await AsyncStorage.setItem(INCIDENTS_KEY, snapshot.incidents);
    }

    if (snapshot.queue === null) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, snapshot.queue);
    }

    if (snapshot.version === null) {
      await AsyncStorage.removeItem(VERSION_KEY);
    } else {
      await AsyncStorage.setItem(VERSION_KEY, snapshot.version);
    }

    return 'rolled_back';
  }
}
