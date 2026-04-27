/// <reference types="vite/client" />

/**
 * Globais injetados via Vite `define` em build-time.
 * Veja `vite.config.ts` pra origem.
 */
declare const __APP_VERSION__: string;

/**
 * Shim de tipos pro `typo-js` — o pacote nao publica .d.ts.
 * So' os metodos que a gente usa.
 */
declare module "typo-js" {
  interface TypoSettings {
    dictionaryPath?: string;
    flags?: Record<string, unknown>;
    asyncLoad?: boolean;
    loadedCallback?: (typo: Typo) => void;
    platform?: "any" | "chrome" | "browser";
  }

  class Typo {
    constructor(
      dictionary?: string | null,
      affData?: string | null,
      wordsData?: string | null,
      settings?: TypoSettings,
    );
    check(word: string): boolean;
    suggest(word: string, limit?: number): string[];
  }

  export default Typo;
}
