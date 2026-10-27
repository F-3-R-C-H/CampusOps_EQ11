import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSchemaVersion, migrate, SCHEMA_VERSION } from '../infrastructure/persistence/MigrationManager';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('MigrationManager v1 -> v2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('nominal: migrate(1,2) aplica migración, conserva datos y actualiza schema_version a 2', async () => {
    const incidents = [
      { id: 'campus-inc-001', title: 'Falla eléctrica', status: 'assigned' },
      { id: 'campus-inc-002', title: 'Fuga de agua', status: 'reported' },
      { id: 'campus-inc-003', title: 'Puerta atascada', status: 'in_progress', category: 'security' },
    ];
    const queue = [
      {
        operationId: 'op-start-001',
        incidentId: 'campus-inc-001',
        actorId: 'technician-1',
        baseVersion: 1,
        action: 'start',
        payload: { note: 'Iniciando revisión' },
        createdAt: new Date().toISOString(),
      },
    ];

    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === 'campusops:incidents') return Promise.resolve(JSON.stringify(incidents));
      if (key === 'campusops:offline_queue') return Promise.resolve(JSON.stringify(queue));
      if (key === 'campusops:schema_version') return Promise.resolve('1');
      return Promise.resolve(null);
    });

    const result = await migrate(1, 2, false);
    expect(result).toBe('ok');
    expect(mockAsyncStorage.setItem).toHaveBeenCalled();

    // Verifica que se guardó schema_version a 2
    const versionCalls = mockAsyncStorage.setItem.mock.calls.filter((c) => c[0] === 'campusops:schema_version');
    expect(versionCalls.length).toBeGreaterThan(0);
    const lastVersionCall = versionCalls[versionCalls.length - 1];
    expect(lastVersionCall?.[1]).toBe('2');

    // Verifica que incidencias migradas incluyen category cuando falta
    const incidentsCalls = mockAsyncStorage.setItem.mock.calls.filter((c) => c[0] === 'campusops:incidents');
    expect(incidentsCalls.length).toBeGreaterThan(0);
    const lastIncidentsCall = incidentsCalls[incidentsCalls.length - 1];
    const savedIncidents = JSON.parse(lastIncidentsCall?.[1] ?? '[]');
    expect(savedIncidents[0].category).toBe('maintenance');
    expect(savedIncidents[1].category).toBe('maintenance');
    expect(savedIncidents[2].category).toBe('security'); // ya tenía categoría, se conserva
    expect(savedIncidents.length).toBe(3);

    // Cola debe permanecer intacta (no fue eliminada)
    expect(queue.length).toBe(1);
  });

  test('failure with injectFail: rollback restaura snapshot completo sin estado parcial', async () => {
    const incidents = [
      { id: 'campus-inc-001', title: 'Falla eléctrica', status: 'assigned' },
    ];
    const queue = [
      {
        operationId: 'op-start-001',
        incidentId: 'campus-inc-001',
        actorId: 'technician-1',
        baseVersion: 1,
        action: 'start',
        payload: { note: 'Iniciando revisión eléctrica' },
        createdAt: '2026-10-26T10:00:00.000Z',
      },
    ];

    mockAsyncStorage.getItem.mockImplementation((key: string) => {
      if (key === 'campusops:incidents') return Promise.resolve(JSON.stringify(incidents));
      if (key === 'campusops:offline_queue') return Promise.resolve(JSON.stringify(queue));
      if (key === 'campusops:schema_version') return Promise.resolve('1');
      return Promise.resolve(null);
    });

    const result = await migrate(1, 2, true);
    expect(result).toBe('rolled_back');

    // Debe restaurar incidents exactamente como estaba
    const incidentsSetCalls = mockAsyncStorage.setItem.mock.calls.filter((c) => c[0] === 'campusops:incidents');
    expect(incidentsSetCalls.length).toBeGreaterThan(0);
    const lastIncidentsSetCall = incidentsSetCalls[incidentsSetCalls.length - 1];
    expect(lastIncidentsSetCall?.[1]).toBe(JSON.stringify(incidents));

    // Debe restaurar queue exactamente como estaba
    const queueSetCalls = mockAsyncStorage.setItem.mock.calls.filter((c) => c[0] === 'campusops:offline_queue');
    expect(queueSetCalls.length).toBeGreaterThan(0);
    const lastQueueSetCall = queueSetCalls[queueSetCalls.length - 1];
    expect(lastQueueSetCall?.[1]).toBe(JSON.stringify(queue));

    // Debe restaurar schema_version a 1
    const versionSetCalls = mockAsyncStorage.setItem.mock.calls.filter((c) => c[0] === 'campusops:schema_version');
    expect(versionSetCalls.length).toBeGreaterThan(0);
    const lastVersionSetCall = versionSetCalls[versionSetCalls.length - 1];
    expect(lastVersionSetCall?.[1]).toBe('1');
  });

  test('boundary: getCurrentSchemaVersion retorna 0 si no existe y SCHEMA_VERSION es 2', async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const current = await getCurrentSchemaVersion();
    expect(current).toBe(0);
    expect(SCHEMA_VERSION).toBe(2);
  });
});
