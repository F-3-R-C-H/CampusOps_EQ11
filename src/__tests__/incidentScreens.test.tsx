import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { Incidencia } from '../domain/models/Incidencia';
import type {
  IIncidenciaRepository,
  IncidentDetailResult,
  IncidentListResult,
} from '../domain/ports/IIncidenciaRepository';
import { DetalleIncidencia } from '../ui/screens/DetalleIncidencia';
import { ListaIncidencias } from '../ui/screens/ListaIncidencias';

const incident: Incidencia = {
  id: 'campus-inc-001',
  version: 1,
  description: 'Falla sintética',
  category: 'connectivity',
  status: 'assigned',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
  location: 'Edificio de prueba A',
  priority: 'medium',
  notes: [],
  evidence: [],
  history: [],
};

function repository(
  getAll: jest.Mock<Promise<IncidentListResult>, []>,
  getById = jest.fn<Promise<IncidentDetailResult>, [string]>().mockResolvedValue({
    ok: true,
    kind: 'data',
    incident,
  }),
): IIncidenciaRepository {
  return { getAll, getById, create: jest.fn() };
}

describe('ListaIncidencias query states', () => {
  test('renders a truly empty list', async () => {
    const repo = repository(jest.fn().mockResolvedValue({
      ok: true,
      kind: 'empty',
      incidents: [],
      unavailable: [],
    }));
    const view = await render(<ListaIncidencias repository={repo} onSelectIncidencia={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('lista-vacia')).toBeTruthy());
  });

  test('renders payload absence without inventing list items', async () => {
    const repo = repository(jest.fn().mockResolvedValue({
      ok: true,
      kind: 'payload_absent',
      incidents: [],
      unavailable: [{ id: 'campus-inc-001', version: 1, status: 'assigned' }],
    }));
    const view = await render(<ListaIncidencias repository={repo} onSelectIncidencia={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('lista-payload-ausente')).toBeTruthy());
    expect(view.queryByTestId('incidencia-campus-inc-001')).toBeNull();
  });

  test('retries after an error and displays the successful result', async () => {
    const getAll = jest.fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
      .mockResolvedValueOnce({ ok: true, kind: 'data', incidents: [incident], unavailable: [] });
    const view = await render(<ListaIncidencias repository={repository(getAll)} onSelectIncidencia={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('lista-error')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByText('Reintentar'));
      await Promise.resolve();
    });
    await waitFor(() => expect(view.getByTestId('incidencia-campus-inc-001')).toBeTruthy());
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  test('does not let an obsolete response replace current data', async () => {
    let resolveFirst: ((result: IncidentListResult) => void) | undefined;
    const first = new Promise<IncidentListResult>((resolve) => { resolveFirst = resolve; });
    const oldRepo = repository(jest.fn().mockReturnValue(first));
    const currentIncident = { ...incident, id: 'campus-inc-current', description: 'Dato actual' };
    const currentRepo = repository(jest.fn().mockResolvedValue({
      ok: true,
      kind: 'data',
      incidents: [currentIncident],
      unavailable: [],
    }));
    const view = await render(<ListaIncidencias repository={oldRepo} onSelectIncidencia={jest.fn()} />);
    await view.rerender(<ListaIncidencias repository={currentRepo} onSelectIncidencia={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('incidencia-campus-inc-current')).toBeTruthy());
    await act(async () => {
      resolveFirst?.({ ok: true, kind: 'data', incidents: [incident], unavailable: [] });
      await Promise.resolve();
    });
    expect(view.queryByTestId('incidencia-campus-inc-001')).toBeNull();
  });
});

describe('DetalleIncidencia query states', () => {
  test('renders a valid detail', async () => {
    const repo = repository(jest.fn(), jest.fn().mockResolvedValue({ ok: true, kind: 'data', incident }));
    const view = await render(<DetalleIncidencia repository={repo} incidenciaId={incident.id} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getAllByText('Falla sintética')).toHaveLength(2));
  });

  test('renders explicit payload absence', async () => {
    const repo = repository(jest.fn(), jest.fn().mockResolvedValue({
      ok: true,
      kind: 'payload_absent',
      resource: { id: incident.id, version: 1, status: 'assigned' },
    }));
    const view = await render(<DetalleIncidencia repository={repo} incidenciaId={incident.id} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('detalle-payload-ausente')).toBeTruthy());
  });

  test('shows HTTP errors and retries', async () => {
    const getById = jest.fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'http', status: 404, code: 'not_found' } })
      .mockResolvedValueOnce({ ok: true, kind: 'data', incident });
    const repo = repository(jest.fn(), getById);
    const view = await render(<DetalleIncidencia repository={repo} incidenciaId={incident.id} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId('detalle-error')).toBeTruthy());
    expect(view.getByText('Incidencia no encontrada.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Reintentar'));
      await Promise.resolve();
    });
    await waitFor(() => expect(view.getAllByText('Falla sintética')).toHaveLength(2));
    expect(getById).toHaveBeenCalledTimes(2);
  });
});
