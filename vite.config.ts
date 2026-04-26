import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Le a versao do package.json em build-time pra injetar como global.
// Single source of truth — assim o "Sobre" no SettingsDialog sempre
// mostra a versao real publicada, sem precisar lembrar de bumpar
// manualmente um string hardcoded em components.
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 4100,
    strictPort: false,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  define: {
    // Substituido literalmente no bundle — `__APP_VERSION__` no codigo
    // vira a string da versao. NAO funciona pra dynamic import; e build-
    // time apenas. JSON.stringify garante aspas no replace.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
}));
