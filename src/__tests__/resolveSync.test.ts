import { resolveSync } from '../course-evaluation';
import type { SyncRecord } from '../course-evaluation/contracts';

describe('resolveSync - Sincronización con detección de conflictos (Semana 8)', () => {
  test('cuando no hay cambios en local ni remoto, retorna merged con valores existentes', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara rota', priority: 2 } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara rota', priority: 2 } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara rota', priority: 2 } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'merged',
      fields: { title: 'Lámpara rota', priority: 2 },
    });
  });

  test('cuando solo local cambia un campo, se propaga el cambio local en merged', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara', description: 'Original' } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara', description: 'Detalle técnico offline' } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara', description: 'Original' } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'merged',
      fields: { title: 'Lámpara', description: 'Detalle técnico offline' },
    });
  });

  test('cuando solo remoto cambia un campo, se propaga el cambio remoto en merged', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara', priority: 1 } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Lámpara', priority: 1 } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { title: 'Lámpara', priority: 3 } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'merged',
      fields: { title: 'Lámpara', priority: 3 },
    });
  });

  test('combina cambios en campos independientes sin conflicto', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Base', notes: 'Base notes', priority: 1 } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { title: 'Base', notes: 'Nota del técnico', priority: 1 } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { title: 'Base', notes: 'Base notes', priority: 2 } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'merged',
      fields: { title: 'Base', notes: 'Nota del técnico', priority: 2 },
    });
  });

  test('detecta conflicto cuando ambos modifican el mismo campo con valores diferentes', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { status: 'assigned' } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { status: 'in_progress' } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { status: 'cancelled' } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'conflict',
      fields: ['status'],
    });
  });

  test('si ambos cambian al MISMO valor idéntico, no genera conflicto y preserva el valor', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { status: 'assigned' } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { status: 'in_progress' } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { status: 'in_progress' } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'merged',
      fields: { status: 'in_progress' },
    });
  });

  test('múltiples campos en conflicto se reportan ordenados alfabéticamente', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { zebra: 1, alpha: 'A', middle: true } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { zebra: 2, alpha: 'Local', middle: false } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { zebra: 3, alpha: 'Remote', middle: false } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'conflict',
      fields: ['alpha', 'zebra'],
    });
  });

  test('compara por contenido JSON profundo y no por identidad de objetos', () => {
    const baseWork = { assignedTechnicianId: 'technician-1', status: 'assigned' };
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { work: baseWork } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { work: { ...baseWork } } }; // nueva referencia, mismo contenido
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } } };

    const result = resolveSync(base, local, remote);
    expect(result).toEqual({
      kind: 'merged',
      fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } },
    });
  });

  test('garantiza inmutabilidad estricta de las entradas base, local y remote', () => {
    const base: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } } };
    const local: SyncRecord = { id: 'campus-inc-001', version: 1, fields: { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } } };
    const remote: SyncRecord = { id: 'campus-inc-001', version: 2, fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } } };

    const baseSnapshot = JSON.stringify(base);
    const localSnapshot = JSON.stringify(local);
    const remoteSnapshot = JSON.stringify(remote);

    resolveSync(base, local, remote);

    expect(JSON.stringify(base)).toBe(baseSnapshot);
    expect(JSON.stringify(local)).toBe(localSnapshot);
    expect(JSON.stringify(remote)).toBe(remoteSnapshot);
  });
});
