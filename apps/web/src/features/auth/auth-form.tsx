'use client';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice } from '@portal/ui';
import { api, ApiError } from '../../lib/api-client';
import type { Principal } from '../../lib/session';
import { useHydrated } from '../shared/use-hydrated';
export function PasswordInput({
  id,
  autoComplete,
  error,
  hint,
}: {
  id: string;
  autoComplete: string;
  error?: string;
  hint?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <Input
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        maxLength={128}
        aria-invalid={!!error}
        aria-describedby={
          [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
        }
      />
      <button
        type="button"
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} senha`}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
export function AuthForm({ mode }: { mode: 'login' | 'change' }) {
  const login = mode === 'login';
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api('auth/logout', { method: 'POST', body: '{}' });
      window.location.assign('/login');
    } catch {
      setError('Não foi possível sair. Tente novamente.');
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const next: Record<string, string> = {};
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const current = String(data.get('currentPassword') ?? '');
    const fresh = String(data.get('newPassword') ?? '');
    if (login) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Informe um e-mail válido.';
      if (!password) next.password = 'Informe a senha.';
    } else {
      if (!current) next.currentPassword = 'Informe a senha atual.';
      if (fresh.length < 15) next.newPassword = 'Use de 15 a 128 caracteres.';
      if (fresh !== data.get('confirmation')) next.confirmation = 'As senhas devem ser iguais.';
    }
    setErrors(next);
    setError('');
    const first = Object.keys(next)[0];
    if (first) {
      form.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const principal = await api<Principal>(`auth/${login ? 'login' : 'change-password'}`, {
        method: 'POST',
        body: JSON.stringify(
          login ? { email, password } : { currentPassword: current, newPassword: fresh },
        ),
      });
      form.reset();
      window.location.assign(principal.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 401
          ? login
            ? 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
            : 'Confira a senha atual. Se a sessão expirou, entre novamente.'
          : 'Serviço indisponível. Tente novamente em instantes.',
      );
      setBusy(false);
    }
  }
  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      aria-busy={busy || !hydrated}
      className="form-stack"
    >
      <fieldset disabled={busy || !hydrated}>
        {error && <Notice error>{error}</Notice>}
        {login ? (
          <>
            <Field id="email" label="E-mail" error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                maxLength={254}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
            </Field>
            <Field id="password" label="Senha" error={errors.password}>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                error={errors.password}
              />
            </Field>
          </>
        ) : (
          <>
            <Field id="currentPassword" label="Senha atual" error={errors.currentPassword}>
              <PasswordInput
                id="currentPassword"
                autoComplete="current-password"
                error={errors.currentPassword}
              />
            </Field>
            <Field
              id="newPassword"
              label="Nova senha"
              hint="Use de 15 a 128 caracteres. Você pode usar uma frase longa."
              error={errors.newPassword}
            >
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                error={errors.newPassword}
                hint
              />
            </Field>
            <Field id="confirmation" label="Confirmar nova senha" error={errors.confirmation}>
              <PasswordInput
                id="confirmation"
                autoComplete="new-password"
                error={errors.confirmation}
              />
            </Field>
          </>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Aguarde…' : login ? 'Entrar' : 'Salvar nova senha'}
        </Button>
        {login && (
          <p className="muted small">
            Precisa de acesso ou esqueceu a senha? Procure o administrador do portal.
          </p>
        )}
        {!login && (
          <div className="actions">
            <a href="/dashboard">Voltar ao portal</a>
            <Button variant="secondary" disabled={busy} onClick={logout}>
              Sair desta conta
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
