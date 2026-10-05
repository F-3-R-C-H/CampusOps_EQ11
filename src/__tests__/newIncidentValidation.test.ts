import { validateNewIncident } from '../domain/models/NewIncident';

describe('validateNewIncident', () => {
  test('accepts a valid draft and trims the texts', () => {
    expect(validateNewIncident({ category: 'water', description: '  Fuga en el baño  ', location: ' Edificio A ' }))
      .toEqual({ ok: true, value: { category: 'water', description: 'Fuga en el baño', location: 'Edificio A' } });
  });

  test.each([
    'electrical', 'laboratory', 'water', 'connectivity', 'equipment', 'safety', 'maintenance',
  ])('accepts the published category %s', (category) => {
    expect(validateNewIncident({ category, description: 'x', location: 'y' }).ok).toBe(true);
  });

  test.each([['plumbing'], ['WATER'], [42], [{}]])('rejects invalid category %p', (category) => {
    expect(validateNewIncident({ category, description: 'x', location: 'y' }))
      .toEqual({ ok: false, errors: { category: 'invalid_category' } });
  });

  test.each([[undefined], [null], ['']])('requires a category when it is %p', (category) => {
    expect(validateNewIncident({ category, description: 'x', location: 'y' }))
      .toEqual({ ok: false, errors: { category: 'required' } });
  });

  test.each([[''], ['   '], ['\n\t'], [undefined], [null], [7]])('rejects empty or non-text description %p', (description) => {
    expect(validateNewIncident({ category: 'water', description, location: 'y' }))
      .toEqual({ ok: false, errors: { description: 'required' } });
  });

  test('rejects empty location', () => {
    expect(validateNewIncident({ category: 'water', description: 'x', location: '   ' }))
      .toEqual({ ok: false, errors: { location: 'required' } });
  });

  test('reports every invalid field at once', () => {
    expect(validateNewIncident({ category: '', description: '', location: '' })).toEqual({
      ok: false,
      errors: { category: 'required', description: 'required', location: 'required' },
    });
  });
});
