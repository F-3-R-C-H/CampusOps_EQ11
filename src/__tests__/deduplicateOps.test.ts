import { deduplicateOperations } from '../course-evaluation';

describe('deduplicateOperations - Deduplicación idempotente de operaciones (Semana 8)', () => {
  test('lista vacía retorna lista vacía', () => {
    const operations: readonly { operationId: string }[] = [];
    const result = deduplicateOperations(operations);
    expect(result).toEqual([]);
  });

  test('lista sin duplicados conserva todos los elementos en el mismo orden', () => {
    const operations = [
      { operationId: 'op-101', type: 'UPDATE_STATUS', status: 'in_progress' },
      { operationId: 'op-102', type: 'ADD_NOTE', note: 'Revisión en sitio' },
      { operationId: 'op-103', type: 'ASSIGN_TECH', technicianId: 'technician-1' },
    ];
    const result = deduplicateOperations(operations);
    expect(result).toEqual(operations);
  });

  test('3 operaciones con el mismo operationId conserva únicamente la primera ocurrencia', () => {
    const opFirst = { operationId: 'op-repeat', attempt: 1, timestamp: 1000 };
    const opSecond = { operationId: 'op-repeat', attempt: 2, timestamp: 2000 };
    const opThird = { operationId: 'op-repeat', attempt: 3, timestamp: 3000 };

    const operations = [opFirst, opSecond, opThird];
    const result = deduplicateOperations(operations);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(opFirst); // Conserva la primera referencia exacta
    const first = result[0];
    expect(first?.attempt).toBe(1);
  });

  test('deduplica en una lista intercalada preservando el primer orden de aparición', () => {
    const opA1 = { operationId: 'op-A', val: 'A-first' };
    const opB1 = { operationId: 'op-B', val: 'B-first' };
    const opA2 = { operationId: 'op-A', val: 'A-second' };
    const opC1 = { operationId: 'op-C', val: 'C-first' };
    const opB2 = { operationId: 'op-B', val: 'B-second' };

    const operations = [opA1, opB1, opA2, opC1, opB2];
    const result = deduplicateOperations(operations);

    expect(result).toEqual([opA1, opB1, opC1]);
  });

  test('no muta el arreglo original de operaciones', () => {
    const op1 = { operationId: 'op-1', count: 10 };
    const op2 = { operationId: 'op-1', count: 20 };
    const op3 = { operationId: 'op-2', count: 30 };

    const operations = Object.freeze([op1, op2, op3]);
    const snapshot = JSON.stringify(operations);

    const result = deduplicateOperations(operations);

    expect(JSON.stringify(operations)).toBe(snapshot);
    expect(result).toHaveLength(2);
    expect(result).not.toBe(operations); // Retorna un nuevo arreglo
  });
});
