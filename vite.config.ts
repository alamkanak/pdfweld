import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    legacy({
      targets: [
        "Chrome >= 90",
        "Firefox >= 114",
        "Safari >= 15.4",
        "Edge >= 90",
      ],
      modernTargets: [
        "Chrome >= 90",
        "Firefox >= 114",
        "Safari >= 15.4",
        "Edge >= 90",
      ],
      modernPolyfills: true,
    }),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: {
        name: "PDFWeld — your document studio",
        short_name: "PDFWeld",
        description:
          "A private, local PDF studio. Read, annotate, organize, edit and export.",
        theme_color: "#202123",
        background_color: "#202123",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,wasm}"],
        globIgnores: ["**/ocr/**"],
        additionalManifestEntries: [
          { url: "field-notes.pdf", revision: "1" },
          { url: "field-notes-cover.png", revision: "1" },
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              url.pathname.includes("/ocr/"),
            handler: "CacheFirst",
            options: {
              cacheName: "pdfweld-ocr-v1",
              expiration: { maxEntries: 12, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 16000000,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["mupdf"] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("node_modules/react")
            ? "react"
            : id.includes("lucide-react")
              ? "icons"
              : undefined,
      },
    },
  },
  server: { host: "0.0.0.0", port: 5173 },
});
