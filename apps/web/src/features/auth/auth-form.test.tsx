// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthForm } from './auth-form';
import { renderToStaticMarkup } from 'react-dom/server';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('does not allow credential entry before hydration and never falls back to GET', () => {
  const html = renderToStaticMarkup(<AuthForm mode="login" />);
  expect(html).toContain('method="post"');
  expect(html).toMatch(/<fieldset[^>]*disabled/);
});

it('keeps credentials masked and reports a generic login failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  render(<AuthForm mode="login" />);
  expect((screen.getByLabelText('Senha') as HTMLInputElement).type).toBe('password');
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pessoa@example.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('E-mail ou senha incorretos'),
  );
});

it('validates forced password change before sending credentials', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<AuthForm mode="change" />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  await waitFor(() => expect(screen.getByText('Informe a senha atual.')).toBeTruthy());
  expect(fetch).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByLabelText('Senha atual'));
});
