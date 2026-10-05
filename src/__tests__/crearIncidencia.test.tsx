import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { Incidencia } from '../domain/models/Incidencia';
import type { CreateIncidentResult, IIncidenciaRepository } from '../domain/ports/IIncidenciaRepository';
import { CrearIncidencia } from '../ui/screens/CrearIncidencia';

// El primer render de React Native en frío puede superar los 5 s por defecto de Jest.
jest.setTimeout(30000);

const incident: Incidencia = {
  id: 'campus-inc-101',
  version: 1,
  description: 'Fuga simulada',
  category: 'water',
  status: 'open',
  reporterId: 'reporter-1',
  assignedTechnicianId: null,
  location: 'Zona manual ficticia',
  priority: 'medium',
  notes: [],
  evidence: [],
  history: [],
};

const createdResult: CreateIncidentResult = { ok: true, kind: 'created', incident, operationId: 'k' };
const uncertainResult: CreateIncidentResult = { ok: false, error: { kind: 'uncertain', cause: 'timeout' } };

function setup(create: jest.Mock<Promise<CreateIncidentResult>, [unknown, string]>) {
  const repository: IIncidenciaRepository = { getAll: jest.fn(), getById: jest.fn(), create };
  let counter = 0;
  const generateKey = () => `key-${String(++counter).padStart(8, '0')}`;
  const onCreated = jest.fn();
  const onCancel = jest.fn();
  return { repository, generateKey, onCreated, onCancel };
}

// En RNTL 14 fireEvent es asíncrono y ya envuelve su propio act(): se espera
// cada llamada y no se anida dentro de otro act().
async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await fireEvent.press(view.getByTestId(testID));
}

async function fillValidForm(view: Awaited<ReturnType<typeof render>>) {
  await press(view, 'categoria-water');
  await fireEvent.changeText(view.getByTestId('input-descripcion'), '  Fuga simulada  ');
  await fireEvent.changeText(view.getByTestId('input-ubicacion'), 'Zona manual ficticia');
}

describe('CrearIncidencia form', () => {
  test('shows field errors and sends nothing when the form is empty', async () => {
    const create = jest.fn();
    const { repository, generateKey, onCreated, onCancel } = setup(create);
    const view = await render(
      <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
    );
    await press(view, 'crear-enviar');
    await waitFor(() => expect(view.getByTestId('error-categoria')).toBeTruthy());
    expect(view.getByTestId('error-descripcion')).toBeTruthy();
    expect(view.getByTestId('error-ubicacion')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test('submits the normalized input with a generated key and reports the created id', async () => {
    const create = jest.fn().mockResolvedValue(createdResult);
    const { repository, generateKey, onCreated, onCancel } = setup(create);
    const view = await render(
      <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
    );
    await fillValidForm(view);
    await press(view, 'crear-enviar');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('campus-inc-101'));
    expect(create).toHaveBeenCalledWith(
      { category: 'water', description: 'Fuga simulada', location: 'Zona manual ficticia' },
      'key-00000001',
    );
    expect(view.getByTestId('crear-exito')).toBeTruthy();
  });

  test('after an uncertain timeout it locks the content and retries with the same key', async () => {
    const create = jest.fn()
      .mockResolvedValueOnce(uncertainResult)
      .mockResolvedValueOnce({ ok: true, kind: 'replayed', incident, operationId: 'k' });
    const { repository, generateKey, onCreated, onCancel } = setup(create);
    const view = await render(
      <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
    );
    await fillValidForm(view);
    await press(view, 'crear-enviar');
    await waitFor(() => expect(view.getByTestId('crear-incierto')).toBeTruthy());
    expect(view.getByTestId('input-descripcion').props.editable).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();

    await press(view, 'crear-enviar');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('campus-inc-101'));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000001']);
    expect(view.getByText('La incidencia campus-inc-101 ya estaba registrada; no se duplicó.')).toBeTruthy();
  });

  test('discarding an uncertain send unlocks the form and the next send is a new operation', async () => {
    const create = jest.fn().mockResolvedValueOnce(uncertainResult).mockResolvedValueOnce(createdResult);
    const { repository, generateKey, onCreated, onCancel } = setup(create);
    const view = await render(
      <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
    );
    await fillValidForm(view);
    await press(view, 'crear-enviar');
    await waitFor(() => expect(view.getByTestId('crear-descartar')).toBeTruthy());
    await press(view, 'crear-descartar');
    await waitFor(() => expect(view.getByTestId('input-descripcion').props.editable).toBe(true));

    await press(view, 'crear-enviar');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000002']);
  });

  test('ignores a second press while the first send is still running', async () => {
  let resolve: ((result: CreateIncidentResult) => void) | undefined;
  const create = jest.fn().mockReturnValue(
    new Promise<CreateIncidentResult>((r) => { resolve = r; }),
  );
  const { repository, generateKey, onCreated, onCancel } = setup(create);
  const view = await render(
    <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
  );
  await fillValidForm(view);

  // Sin await: el primer envío queda pendiente a propósito.
  const firstPress = press(view, 'crear-enviar');
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));

  const secondPress = press(view, 'crear-enviar'); // debe ignorarse
  expect(create).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolve?.(createdResult);
  });
  await Promise.all([firstPress, secondPress]);

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
});

  test.each([
    [{ kind: 'http', status: 403, code: 'forbidden' }, 'Tu perfil no puede crear incidencias.'],
    [{ kind: 'http', status: 422, code: 'invalid_incident' }, 'El backend rechazó los datos de la incidencia.'],
  ] as const)('shows a controlled message for %j and does not lock the form', async (error, message) => {
    const create = jest.fn().mockResolvedValue({ ok: false, error });
    const { repository, generateKey, onCreated, onCancel } = setup(create);
    const view = await render(
      <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
    );
    await fillValidForm(view);
    await press(view, 'crear-enviar');
    await waitFor(() => expect(view.getByTestId('crear-error')).toBeTruthy());
    expect(view.getByText(message)).toBeTruthy();
    expect(view.getByTestId('input-descripcion').props.editable).toBe(true);
  });

  test('cancel calls onCancel without sending', async () => {
    const create = jest.fn();
    const { repository, generateKey, onCreated, onCancel } = setup(create);
    const view = await render(
      <CrearIncidencia repository={repository} generateKey={generateKey} onCreated={onCreated} onCancel={onCancel} />,
    );
    await press(view, 'crear-cancelar');
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(create).not.toHaveBeenCalled();
  });
});
