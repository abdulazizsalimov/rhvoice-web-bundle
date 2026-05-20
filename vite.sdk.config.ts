import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    copyPublicDir: false,
    lib: {
      entry: "./src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "dist/sdk",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
