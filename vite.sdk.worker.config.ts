import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    copyPublicDir: false,
    emptyOutDir: true,
    modulePreload: false,
    outDir: "dist/sdk",
    rollupOptions: {
      input: {
        "worker/rhvoice.worker": "./src/worker/rhvoice.worker.ts",
      },
      output: {
        assetFileNames: "worker/assets/[name]-[hash][extname]",
        chunkFileNames: "worker/chunks/[name]-[hash].js",
        entryFileNames: "[name].js",
      },
    },
    sourcemap: true,
    target: "es2020",
  },
});
