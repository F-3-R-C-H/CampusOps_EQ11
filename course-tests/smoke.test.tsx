import { render, waitFor } from '@testing-library/react-native';

import App from '../App';
import { IncidenciaMemoryRepo } from '../src/infrastructure/memory/IncidenciaMemoryRepo';

jest.mock('../src/api/courseBackend', () => ({
  getBackendHealth: jest.fn().mockResolvedValue({
    ok: true,
    service: 'dmi-controlled-backend',
    contractVersion: 1,
  }),
}));

test('renders the reproducible baseline and resolves backend state', async () => {
  const view = await render(<App repository={new IncidenciaMemoryRepo()} />);
  expect(view.getByText('CampusOps')).toBeTruthy();
  await waitFor(() => expect(view.getByTestId('backend-status').props.children.join('')).toContain('available'));
});
