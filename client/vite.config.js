import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP headers are required for SharedArrayBuffer, which MediaPipe WASM needs
// for multi-threaded inference. Using 'credentialless' instead of 'require-corp'
// allows loading CDN assets without CORP headers (Chrome 96+).
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh'],
  },
})
