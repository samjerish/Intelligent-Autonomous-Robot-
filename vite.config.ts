import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const customLogger = createLogger()
const loggerError = customLogger.error
customLogger.error = (msg, options) => {
  if (
    msg.includes('EADDRNOTAVAIL') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ws proxy socket error') ||
    msg.includes('ws proxy error')
  ) {
    return
  }
  loggerError(msg, options)
}

// https://vite.dev/config/
export default defineConfig({
  customLogger,
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            // Silently suppress ECONNRESET/EADDRNOTAVAIL during server restart/client disconnect
            if (err?.code !== 'ECONNRESET' && err?.code !== 'EADDRNOTAVAIL') {
              console.warn('[vite proxy error]:', err?.message || err);
            }
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        }
      }
    }
  }
})
