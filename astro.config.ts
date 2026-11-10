import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://gordonbeeming.dev",
  output: "static",
  // Scripts stay in their own files so the Content-Security-Policy in
  // public/_headers can allow 'self' without a hash or 'unsafe-inline'.
  vite: { build: { assetsInlineLimit: 0 } },
});
