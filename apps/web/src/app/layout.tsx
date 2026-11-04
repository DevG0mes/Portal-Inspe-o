import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'PSI Energy | Portal de Inspeção de Segurança',
  description: 'Inspeções de segurança, evidências e acompanhamento de ações corretivas.',
  icons: {
    icon: '/brand/inspection-icon.svg',
    apple: { url: '/brand/inspection-icon-180.png', sizes: '180x180', type: 'image/png' },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
