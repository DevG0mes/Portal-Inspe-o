'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
/** Each path change cancels the previous request, including response processing. */
export function useResource<T>(path: string | null, revision = 0) {
  const [state, setState] = useState<{
    path: string | null;
    revision: number;
    data?: T;
    error?: unknown;
    loading: boolean;
  }>({ path, revision, loading: true });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState({ path, revision, loading: true });
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, revision, data, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ path, revision, error, loading: false });
      });
    return () => controller.abort();
  }, [path, revision]);
  return state.path === path && state.revision === revision
    ? state
    : { path, revision, loading: true, data: undefined, error: undefined };
}
