import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Only treat the root index.html as the entry point.
  // Prevents Vite from scanning historical/ for additional HTML entry points.
  build: {
    rollupOptions: {
      input: './index.html',
    },
  }, 
})
