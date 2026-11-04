import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PSI Energy | Portal de Inspeção de Segurança',
    short_name: 'Inspeção PSI',
    start_url: '/',
    display: 'standalone',
    icons: [
      { src: '/brand/inspection-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/inspection-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
