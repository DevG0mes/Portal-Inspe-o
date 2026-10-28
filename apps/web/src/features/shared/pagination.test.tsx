// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Pagination } from './pagination';
afterEach(cleanup);
it('changing a remote selection page never submits its parent form', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const page = vi.fn();
  render(
    <form noValidate onSubmit={submit}>
      <Pagination page={1} pageSize={10} total={20} onPage={page} />
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
  expect(page).toHaveBeenCalledWith(2);
  expect(submit).not.toHaveBeenCalled();
});
