import { useState } from "react";
import { FilePlus2, Send, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { atomicWriteTextFile } from "../../lib/atomicWrite";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

export function Scratchpad() {
  const open = useAppStore((s) => s.scratchpadOpen);
  const text = useAppStore((s) => s.scratchpadText);
  const setText = useAppStore((s) => s.setScratchpadText);
  const close = useAppStore((s) => s.closeScratchpad);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const setFileBody = useAppStore((s) => s.setFileBody);
  const pushToast = useAppStore((s) => s.pushToast);
  const { refresh, openFile } = useFileSystem();
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const appendToActive = () => {
    if (!activeFilePath) {
      pushToast("info", "Abra um arquivo antes de inserir o scratchpad.");
      return;
    }
    const current = useAppStore.getState().fileBody;
    setFileBody(`${current.replace(/\s*$/, "")}\n\n${text.trim()}\n`);
    pushToast("success", "Fragmento inserido no arquivo ativo.");
    close();
  };

  const saveAsNote = async () => {
    if (!rootFolder || !text.trim()) return;
    if (!isTauri) return;
    setSaving(true);
    try {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const base = "Scratch";
      let name = `${base}.md`;
      let n = 1;
      while (await exists(joinPath(rootFolder, name))) {
        n += 1;
        name = `${base} ${n}.md`;
        if (n > 999) break; // sanity guard
      }
      const path = joinPath(rootFolder, name);
      // Atomic: nota acabada de criar com conteudo importante do user.
      // Sem atomic, crash durante o write deixa arquivo truncado.
      const ok = await atomicWriteTextFile(path, `${text.trim()}\n`);
      if (!ok) {
        pushToast("error", "Falha ao salvar a nota.");
        return;
      }
      await refresh();
      await openFile(path, name);
      setText("");
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed right-5 bottom-8 z-[130] w-[min(520px,calc(100vw-40px))] overflow-hidden"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div className="solon-dialog-header" style={{ padding: "0.6rem 0.85rem" }}>
        <div className="flex items-center gap-2">
          <FilePlus2 size={14} style={{ color: "var(--accent)" }} />
          <span className="solon-plaque">Scratchpad</span>
          <span className="solon-caps--sm" style={{ color: "var(--text-muted)" }}>
            efêmero
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="solon-dialog-close"
        >
          <X size={13} />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        placeholder="Escreva sem criar arquivo…"
        className="w-full h-56 resize-none bg-transparent outline-none px-4 py-3 leading-relaxed"
        style={{
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
          fontSize: "0.98rem",
        }}
      />
      <div className="solon-dialog-actions" style={{ padding: "0.6rem 0.85rem" }}>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={appendToActive}
          className="solon-btn inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Send size={13} />
          Inserir no ativo
        </button>
        <button
          type="button"
          disabled={!rootFolder || !text.trim() || saving}
          onClick={saveAsNote}
          className="solon-btn solon-btn--primary inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <FilePlus2 size={13} />
          Salvar nota
        </button>
      </div>
    </div>
  );
}
