'use client';
import { useEffect, useState } from 'react';
import type { Paginated, ReportView } from '@portal/contracts';
import { api } from '../../lib/api-client';
/** Background reads preserve visible rows/download state; changing page never exposes stale rows. */
export function useReports(page: number, revision: number) {
  const path = `reports?page=${page}&pageSize=10`,
    [state, setState] = useState<{
      path: string;
      data?: Paginated<ReportView>;
      error?: unknown;
      loading: boolean;
    }>({ path, loading: true });
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined,
      delay = 5000;
    async function load() {
      if (document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setState((old) =>
        old.path === path ? { ...old, error: undefined, loading: true } : { path, loading: true },
      );
      try {
        const data = await api<Paginated<ReportView>>(path, { signal: request.signal });
        if (stopped || request.signal.aborted) return;
        setState({ path, data, loading: false });
        if (data.data.some((r) => r.state === 'QUEUED' || r.state === 'PROCESSING')) {
          timer = setTimeout(load, delay);
          delay = Math.min(15000, Math.round(delay * 1.5));
        }
      } catch (error) {
        if (stopped || request.signal.aborted) return;
        setState((old) =>
          old.path === path ? { ...old, error, loading: false } : { path, error, loading: false },
        );
      }
    }
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [path, revision]);
  return state.path === path ? state : { path, loading: true, data: undefined, error: undefined };
}
