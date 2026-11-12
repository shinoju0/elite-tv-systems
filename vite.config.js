import { defineConfig } from 'vite';

// Im Dev-Modus laufen API und Uploads über den lokalen Elite-Server (npm start)
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/media': 'http://localhost:8787'
    }
  }
});
