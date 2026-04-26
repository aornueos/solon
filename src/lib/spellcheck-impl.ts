/**
 * Modulo pesado do spellcheck — engine `nspell` + dicionario Hunspell
 * pt-BR. NAO importar diretamente; usar `./spellcheck.ts` (facade).
 *
 * O peso (~5MB do .dic + ~50KB do nspell) e' isolado neste modulo pra
 * que o Vite o splita em chunk separado. So' baixa quando o usuario
 * fizer o primeiro right-click em palavra ou o pre-warm disparar.
 *
 * Estrategia de loading:
 *  - Os arquivos .aff/.dic vem de `dictionary-pt` no npm
 *  - O package usa `exports` restritivo, entao subpath import direto
 *    nao funciona via Vite
 *  - `scripts/copy-spellcheck-dict.cjs` (postinstall) copia pra
 *    public/dict/pt.{aff,dic}
 *  - Vite serve esses arquivos como assets estaticos
 *  - Aqui fazemos fetch() em runtime e construimos o nspell
 *
 * Em dev, Vite serve a partir de public/. Em build de producao, os
 * arquivos sao copiados pra dist/ automaticamente. Em Tauri bundle, vao
 * pro app bundle.
 */
import NSpell from "nspell";

/**
 * Carrega e instancia o nspell. Async — primeira chamada faz dois
 * fetches em paralelo + compilacao das regras de afixacao do Hunspell
 * (~100-300ms em maquina lenta). Subsequentes chamadas retornam
 * imediatamente do cache do facade.
 */
export async function load(): Promise<NSpell> {
  // base path absoluta. Em Tauri 2 com decorations:false, o WebView
  // serve a partir de tauri://localhost/. Vite em dev usa /. Path
  // relativo a' raiz funciona nos dois.
  const [affRes, dicRes] = await Promise.all([
    fetch("/dict/pt.aff"),
    fetch("/dict/pt.dic"),
  ]);

  if (!affRes.ok || !dicRes.ok) {
    throw new Error(
      `Falha ao carregar dicionario: aff=${affRes.status}, dic=${dicRes.status}. ` +
        `Verifique se public/dict/pt.{aff,dic} existem (rode 'npm install' pra disparar o postinstall).`,
    );
  }

  const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
  return NSpell(aff, dic);
}
