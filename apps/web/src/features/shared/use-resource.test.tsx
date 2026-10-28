// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useResource } from './use-resource';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not expose the previous revision during an explicit reload', async () => {
  const observed: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{"value":"old"}'))
      .mockImplementationOnce(() => new Promise(() => {})),
  );
  function Consumer({ revision }: { revision: number }) {
    const result = useResource<{ value: string }>('inspections/id', revision);
    observed.push(result.data?.value ?? 'loading');
    return <span>{result.data?.value ?? 'loading'}</span>;
  }
  const rendered = render(<Consumer revision={0} />);
  await screen.findByText('old');
  observed.length = 0;
  rendered.rerender(<Consumer revision={1} />);
  expect(observed).not.toContain('old');
  expect(screen.getByText('loading')).toBeTruthy();
});
