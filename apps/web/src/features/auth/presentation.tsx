'use client';
import { createContext, useContext, type ReactNode } from 'react';
export type Presentation = 'desktop' | 'mobile';
const PresentationContext = createContext<Presentation>('desktop');
export function PresentationProvider({
  mode,
  children,
}: {
  mode: Presentation;
  children: ReactNode;
}) {
  return <PresentationContext value={mode}>{children}</PresentationContext>;
}
export const usePresentation = () => useContext(PresentationContext);
