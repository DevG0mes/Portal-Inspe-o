// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PredicateEditor } from './predicate-editor';
afterEach(cleanup);
it('reselecting a value after clearing an IN rule removes the invisible empty placeholder', () => {
  const change = vi.fn();
  render(
    <PredicateEditor
      id="rule"
      question={{ id: 'q', label: 'Área', type: 'YES_NO_NA', required: false }}
      predicate={{ operator: 'IN', value: [''] }}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Não', exact: true }));
  expect(change).toHaveBeenCalledWith({ operator: 'IN', value: ['NO'] });
});
