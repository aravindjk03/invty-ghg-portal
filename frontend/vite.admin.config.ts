/**
 * The admin site's build: a separate website from the customer portal.
 *
 *   npm run build:admin   ->  frontend/dist-admin  (deploy to its own address)
 *
 * Its own entry (admin.html -> src/admin/main.tsx), so none of the console's
 * code is in the customer site, and none of the customer site's in this.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, renameSync, writeFileSync } from 'fs';

export default defineConfig({
  base: process.env.VITE_ADMIN_BASE_PATH || '/',
  plugins: [
    react(),
    {
      // Serve admin.html as the site's index, and tell crawlers to keep out.
      name: 'admin-site-files',
      closeBundle() {
        const out = path.resolve(__dirname, 'dist-admin');
        if (existsSync(path.join(out, 'admin.html'))) renameSync(path.join(out, 'admin.html'), path.join(out, 'index.html'));
        writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
        // Static hosts that honour _headers (Cloudflare Pages, Netlify).
        writeFileSync(path.join(out, '_headers'), [
          '/*',
          '  X-Robots-Tag: noindex, nofollow',
          '  X-Frame-Options: DENY',
          '  Referrer-Policy: no-referrer',
          '  X-Content-Type-Options: nosniff',
          '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
          '',
        ].join('\n'));
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  publicDir: false,
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'admin.html') },
  },
  server: { port: 5174, proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } } },
  preview: { port: 4174, proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } } },
});
