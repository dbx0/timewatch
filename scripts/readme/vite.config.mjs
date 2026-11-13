// Demo harness for the README assets: the real React app, with the Tauri APIs aliased to in-memory mocks.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const mock = (f) => path.join(here, "harness/mock", f);

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: mock("core.ts") },
      { find: /^@tauri-apps\/api\/event$/, replacement: mock("event.ts") },
      { find: /^@tauri-apps\/api\/window$/, replacement: mock("window.ts") },
      { find: /^@tauri-apps\/api\/webviewWindow$/, replacement: mock("window.ts") },
      { find: /^@tauri-apps\/plugin-clipboard-manager$/, replacement: mock("clipboard.ts") },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: mock("dialog.ts") },
    ],
  },
  server: { fs: { allow: [repo] }, hmr: false },
  logLevel: "warn",
  clearScreen: false,
});
