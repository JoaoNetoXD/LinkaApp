import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Absolute site address for link previews (Open Graph needs full URLs).
  // Netlify sets URL during builds; VITE_APP_URL overrides it.
  const siteUrl = String(env.VITE_APP_URL || env.URL || 'http://localhost:5173').replace(/\/+$/, '');

  return {
    plugins: [
      {
        name: 'site-url',
        transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
      },
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});
