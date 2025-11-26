import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config with a dev-time proxy to the Flask backend on port 5000.
// This ensures relative API calls like `/execute_workflow_v2` are forwarded
// to the backend without CORS issues while developing.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/execute_workflow_v2': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      },
      '/execute_workflow': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      },
      '/price_history': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      },
      '/health': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      },
      '/nvda_chart.png': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})

