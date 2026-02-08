import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  renameSync,
} from "fs";

function postBuild() {
  return {
    name: "post-build",
    closeBundle() {
      mkdirSync("dist/icons", { recursive: true });
      mkdirSync("dist/popup", { recursive: true });
      copyFileSync("manifest.json", "dist/manifest.json");
      for (const f of readdirSync("public/icons")) {
        copyFileSync(`public/icons/${f}`, `dist/icons/${f}`);
      }
      for (const f of ["index.html", "popup.js", "popup.css"]) {
        if (existsSync(`dist/${f}`)) {
          renameSync(`dist/${f}`, `dist/popup/${f}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), postBuild()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
