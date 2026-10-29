// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
import { ReportRequestButton } from './report-request-button';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('closes the confirmation and retains a recovery link when automatic navigation does not happen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ id: 'report-test', state: 'QUEUED' }))),
  );
  render(
    <ReportRequestButton
      label="Exportar"
      input={{ format: 'PDF', inspectionId: 'inspection', submissionId: 'submission' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Exportar', exact: true }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Solicitar relatório',
      exact: true,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    screen.getByRole('link', { name: 'Abrir Meus relatórios', exact: true }).getAttribute('href'),
  ).toBe('/reports?report=report-test');
  expect(
    (screen.getByRole('button', { name: 'Exportar', exact: true }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
