import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import { VitePWA } from "vite-plugin-pwa";
import { siteConfig } from "./scripts/site-config.mjs";
import { generateSeo } from "./scripts/seo.mjs";
import { toolPages } from "./src/seo/pages.ts";
import { existsSync } from "node:fs";
export default defineConfig(({ command, mode, isPreview }) => {
  const site = siteConfig({
    env: { ...loadEnv(mode, process.cwd(), ""), ...process.env },
  });
  const base = command === "serve" && !isPreview ? "/" : site.base;
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const slugs = Object.values(toolPages)
    .map((page) => page.slug)
    .join("|");
  return {
    base,
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
      {
        name: "pdfweld-static-seo",
        apply: "build",
        async writeBundle(output) {
          const directory = output.dir || "dist";
          if (existsSync(`${directory}/index.html`))
            await generateSeo(site, directory);
        },
      },
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
          globIgnores: ["**/ocr/**", "tools/**", "404.html"],
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
          navigateFallbackAllowlist: [
            new RegExp(
              `^${escapedBase}(?:index\\.html|tools/(?:${slugs})/(?:index\\.html)?)?(?:\\?.*)?$`,
            ),
          ],
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
  };
});
