import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP are required for SharedArrayBuffer (MediaPipe WASM multi-threading).
// 'credentialless' allows loading same-origin /mediapipe assets without CORP headers.
function securityHeaders({ dev = false } = {}) {
  return {
    'Cross-Origin-Opener-Policy':   'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'X-Content-Type-Options':       'nosniff',
    'X-Frame-Options':              'DENY',
    'Referrer-Policy':              'strict-origin-when-cross-origin',
    // wasm-unsafe-eval is required by MediaPipe WASM. Dev also needs
    // unsafe-inline so the Vite React refresh preamble can run.
    'Content-Security-Policy': [
      "default-src 'self'",
      dev
        ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
        : "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
      "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* http://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https:",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  }
}

export default defineConfig({
  plugins: [react()],
  server:  { headers: securityHeaders({ dev: true }) },
  preview: { headers: securityHeaders() },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh'],
  },
})
