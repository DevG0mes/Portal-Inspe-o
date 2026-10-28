// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResourceForm } from './resource-form';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('saving a name never resubmits permissions or email from a stale snapshot', async () => {
  const initial = {
    id: 'person',
    name: 'Pessoa',
    email: 'pessoa@example.test',
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(initial)))
    .mockResolvedValueOnce(new Response(JSON.stringify(initial)));
  vi.stubGlobal('fetch', fetch);
  render(<ResourceForm kind="users" id="person" ownId="other" />);
  await screen.findByLabelText('Nome');
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo nome' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar', exact: true }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const options = fetch.mock.calls[1]?.[1] as RequestInit;
  expect(JSON.parse(String(options.body))).toEqual({ name: 'Novo nome' });
});
