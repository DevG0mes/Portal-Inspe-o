// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ScheduleDetail } from './schedule-detail';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not discard an unsaved name when changing schedule state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'x',
          name: 'Original',
          revision: 1,
          isActive: true,
          unitName: 'Unidade',
          sectorName: 'Tipo de inspeção',
          formName: 'Ficha',
          responsibles: [],
          frequency: 'DAILY',
          startDate: '2026-10-29',
          time: '08:00',
          endDate: null,
          deadlineHours: 24,
          nextOccurrenceAt: null,
          suspensionReason: null,
        }),
      ),
    ),
  );
  render(<ScheduleDetail id="x" />);
  await screen.findByLabelText('Nome');
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Não salvo' } });
  expect(
    (screen.getByRole('button', { name: 'Pausar programação' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
