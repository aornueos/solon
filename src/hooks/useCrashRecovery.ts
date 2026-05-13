import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { serializeDocument } from "../lib/frontmatter";
import { saveRecoveryDraft } from "../lib/crashRecovery";

/** Intervalo entre escritas do draft enquanto saveStatus == "dirty". */
const DRAFT_INTERVAL_MS = 5000;

/**
 * Hook global: enquanto o arquivo ativo esta "dirty" (auto-save ainda
 * nao gravou), escreve um draft de recovery a cada 5s em
 * `<root>/.solon/.recovery/`. Se o app crashar antes do save real, o
 * draft permite oferecer recuperacao no proximo boot.
 *
 * Quando saveStatus vira "saved", o draft eh apagado pelo `saveFile`
 * em useFileSystem (clearRecoveryDraft) — entao aqui so cuidamos da
 * escrita periodica.
 */
export function useCrashRecovery() {
  useEffect(() => {
    let timer: number | null = null;
    // Cache do ultimo conteudo escrito como draft, por arquivo. Evita
    // re-escrever o mesmo content a cada 5s se o user nao digitou
    // nada novo entre ticks (dirty pode ficar "stuck" enquanto o user
    // pensa). Antes escrevia I/O desnecessario.
    const lastDraft = new Map<string, string>();

    const tick = () => {
      const s = useAppStore.getState();
      if (s.saveStatus !== "dirty" && s.saveStatus !== "saving") return;
      if (!s.activeFilePath || !s.rootFolder) return;
      // Reconstroi o documento COMPLETO (frontmatter + body) — mesmo
      // formato que vai pro disco no save real. Assim a recuperacao
      // restaura tanto sceneMeta quanto body com fidelidade total.
      const content = serializeDocument(s.sceneMeta, s.fileBody);
      const prev = lastDraft.get(s.activeFilePath);
      if (prev === content) return; // nada mudou desde o ultimo draft
      lastDraft.set(s.activeFilePath, content);
      void saveRecoveryDraft(s.rootFolder, s.activeFilePath, content);
    };

    // Limpa o cache quando o arquivo ativo muda — drafts antigos sao
    // limpos pelo saveFile via clearRecoveryDraft, mas o cache local
    // pode segurar o ultimo content de um arquivo ja' fechado e
    // impedir a primeira escrita do draft do novo (se conteudo bater
    // por coincidencia em arquivos vazios, ex). Subscribe granular.
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.activeFilePath !== prev.activeFilePath && prev.activeFilePath) {
        lastDraft.delete(prev.activeFilePath);
      }
    });

    timer = window.setInterval(tick, DRAFT_INTERVAL_MS);
    return () => {
      if (timer != null) window.clearInterval(timer);
      unsub();
    };
  }, []);
}
