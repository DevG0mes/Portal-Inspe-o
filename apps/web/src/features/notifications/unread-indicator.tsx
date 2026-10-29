'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '../../lib/api-client';
export function UnreadIndicator() {
  const path = usePathname(),
    [count, setCount] = useState<number>();
  useEffect(() => {
    let controller: AbortController | undefined,
      stopped = false;
    async function refresh() {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      try {
        const result = await api<{ count: number }>('notifications/unread-count', {
          signal: request.signal,
        });
        if (!stopped && !request.signal.aborted) setCount(result.count);
      } catch {
        /* The central retains explicit retry and error details; a badge never blocks navigation. */
      }
    }
    void refresh();
    const onRefresh = () => void refresh(),
      timer = window.setInterval(onRefresh, 60000);
    window.addEventListener('notifications-read', onRefresh);
    document.addEventListener('visibilitychange', onRefresh);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('notifications-read', onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
    };
  }, [path]);
  return count ? (
    <span aria-label={`${count} não lidas`}> ({count > 99 ? '99+' : count})</span>
  ) : null;
}
