import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [vue()],
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  server: { host: true },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
        '@lib': '/src/lib',
        '@components': '/src/components',
        '@layouts': '/src/layouts',
      },
    },
    server: {
      allowedHosts: ['webhooks-dev.kingkong.net.au'],
    },
  },
});
