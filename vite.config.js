import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4173', 10),
    // Allow Render-provided hostname and common onrender.com domains
    allowedHosts: [
      process.env.RENDER_EXTERNAL_HOSTNAME,
      'multi-screens.onrender.com',
      /\.onrender\.com$/,
    ].filter(Boolean),
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  }
});
