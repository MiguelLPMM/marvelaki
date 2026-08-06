import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Marvelaki",
        short_name: "Marvelaki",
        description:
          "The Marvel timeline in chronological order, with a necessary-viewing graph for each entry.",
        theme_color: "#0b0d12",
        background_color: "#0b0d12",
        display: "standalone",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // data.json is hand-curated and rarely changes, so serve the cached
        // copy instantly and refresh it in the background for next time.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith("data.json"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "timeline-data",
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: { open: true },
});
