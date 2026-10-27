// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Page from './page';

afterEach(cleanup);

it('identifies the portal and explains its current availability', () => {
  render(<Page />);
  expect(
    screen.getByRole('heading', { name: 'Portal de Inspeção de Segurança', level: 1 }),
  ).toBeTruthy();
  expect(screen.getByText('Ambiente em preparação')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /inspeção/i })).toBeNull();
});
