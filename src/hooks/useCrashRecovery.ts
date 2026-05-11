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

    const tick = () => {
      const s = useAppStore.getState();
      if (s.saveStatus !== "dirty" && s.saveStatus !== "saving") return;
      if (!s.activeFilePath || !s.rootFolder) return;
      // Reconstroi o documento COMPLETO (frontmatter + body) — mesmo
      // formato que vai pro disco no save real. Assim a recuperacao
      // restaura tanto sceneMeta quanto body com fidelidade total.
      const content = serializeDocument(s.sceneMeta, s.fileBody);
      void saveRecoveryDraft(s.rootFolder, s.activeFilePath, content);
    };

    timer = window.setInterval(tick, DRAFT_INTERVAL_MS);
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, []);
}
