'use client';
import { createContext, useContext, type ReactNode } from 'react';

const PilotContext = createContext(false);
export function PilotProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <PilotContext.Provider value={enabled}>{children}</PilotContext.Provider>;
}
export const usePilot = () => useContext(PilotContext);
