'use client';
import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
/** SSR controls remain inert until React has attached validation/navigation handlers. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
