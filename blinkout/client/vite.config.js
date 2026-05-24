import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP are required for SharedArrayBuffer (MediaPipe WASM multi-threading).
// 'credentialless' allows loading same-origin /mediapipe assets without CORP headers.
const securityHeaders = {
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'X-Content-Type-Options':       'nosniff',
  'X-Frame-Options':              'DENY',
  'Referrer-Policy':              'strict-origin-when-cross-origin',
  // CSP: wasm-unsafe-eval is required by MediaPipe WASM; data:/blob: for camera
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* https://*.supabase.co wss://*.supabase.co https:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '),
}

export default defineConfig({
  plugins: [react()],
  server:  { headers: securityHeaders },
  preview: { headers: securityHeaders },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh'],
  },
})
