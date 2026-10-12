import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          products: path.resolve(__dirname, 'products.html'),
          productDetails: path.resolve(__dirname, 'product-details.html'),
          about: path.resolve(__dirname, 'about.html'),
          login: path.resolve(__dirname, 'login.html'),
          wishlist: path.resolve(__dirname, 'wishlist.html'),
          trackOrder: path.resolve(__dirname, 'track-order.html'),
          cart: path.resolve(__dirname, 'cart.html'),
          checkout: path.resolve(__dirname, 'checkout.html'),
          returnPolicy: path.resolve(__dirname, 'return-policy.html'),
          contact: path.resolve(__dirname, 'contact.html'),
          faq: path.resolve(__dirname, 'faq.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

