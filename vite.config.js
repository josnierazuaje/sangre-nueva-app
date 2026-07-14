import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: { port: 8765 },
  preview: { port: 8765 },
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías de terceros en chunks propios: conservan su
        // hash entre deploys mientras no cambien, así la PWA no re-descarga
        // los 700+ KB de firebase/react cada vez que se toca una línea de la app.
        manualChunks: {
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/database"],
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            // Con la red mala del recinto, NetworkFirst sin límite cuelga el
            // arranque esperando el HTML; a los 3 s sirve el precacheado.
            options: { cacheName: "sangre-nueva-html", networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
  },
});
