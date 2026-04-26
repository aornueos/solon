import { Sparkles, Check, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import clsx from "clsx";

export function StatusBar() {
  const wordCount = useAppStore((s) => s.wordCount);
  const charCount = useAppStore((s) => s.charCount);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const sceneMeta = useAppStore((s) => s.sceneMeta);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const openUpdateDialog = useAppStore((s) => s.openUpdateDialog);
  const saveStatus = useAppStore((s) => s.saveStatus);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const target = sceneMeta.wordTarget ?? 0;
  const progress = target > 0 ? Math.min(100, (wordCount / target) * 100) : 0;
  const onTarget = target > 0 && wordCount >= target;

  return (
    <div
      className="flex items-center justify-between h-6 px-4 text-[0.68rem]"
      style={{
        background: "var(--bg-panel-2)",
        borderTop: "1px solid var(--border-subtle)",
        color: "var(--text-muted)",
      }}
    >
      <div className="truncate max-w-[40%] flex items-center gap-3">
        {activeFilePath ? (
          <>
            <span className="truncate font-mono opacity-60">{activeFilePath}</span>
            <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
          </>
        ) : (
          <span>Nenhum arquivo</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <UpdateIndicator
          status={updateStatus}
          onClick={openUpdateDialog}
        />
        {target > 0 ? (
          <div className="flex items-center gap-2">
            <span
              className={clsx("tabular-nums", onTarget && "font-medium")}
              style={onTarget ? { color: "var(--success)" } : undefined}
            >
              {wordCount.toLocaleString("pt-BR")} / {target.toLocaleString("pt-BR")} palavras
            </span>
            <div
              className="w-20 h-1 rounded-full overflow-hidden"
              style={{ background: "var(--bg-hover)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: onTarget ? "var(--success)" : "var(--accent-2)",
                }}
              />
            </div>
          </div>
        ) : (
          <span className="tabular-nums">
            {wordCount.toLocaleString("pt-BR")} palavras
          </span>
        )}
        <span className="tabular-nums">
          {charCount.toLocaleString("pt-BR")} caracteres
        </span>
        <span style={{ color: "var(--accent)" }}>Markdown</span>
      </div>
    </div>
  );
}

/**
 * Pequeno indicador de auto-save. Editorial e discreto:
 *  - dirty: ponto am-bar pulsando ("Editado")
 *  - saving: "Salvando…" italico
 *  - saved: "Salvo ha 12s" — atualiza o tempo relativo ate idle
 *  - idle: nada (nao polui a barra quando nada aconteceu)
 *
 * O timestamp relativo re-renderiza a cada 15s pra nao piscar muito mas
 * tambem nao mostrar "Salvo ha 1s" eternamente.
 */
function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: ReturnType<typeof useAppStore.getState>["saveStatus"];
  lastSavedAt: number | null;
}) {
  // Tick a cada 15s pra atualizar "Salvo ha Xs/min". Sem isso, o texto
  // congelaria em "ha 0s" ate o proximo save.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved" || !lastSavedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, [status, lastSavedAt]);

  if (status === "idle") return null;

  if (status === "dirty") {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
        title="Há alterações não salvas — auto-save em 1.2s"
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--accent-2)", animation: "pulse 1.5s ease-in-out infinite" }}
        />
        <span className="italic">Editado</span>
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span
        className="italic"
        style={{ color: "var(--text-muted)" }}
      >
        Salvando…
      </span>
    );
  }

  // saved
  return (
    <span style={{ color: "var(--success)" }}>
      Salvo{lastSavedAt ? ` ${formatRelative(lastSavedAt)}` : ""}
    </span>
  );
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "agora";
  if (sec < 60) return `há ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  return `há ${hr}h`;
}

/**
 * Pílula minúscula que aparece no canto da StatusBar quando ha update.
 * Discreto por design — nao queremos chamar atencao em sessao de escrita.
 * Click abre o UpdateNotesDialog (mesmo que o banner da home).
 */
function UpdateIndicator({
  status,
  onClick,
}: {
  status: ReturnType<typeof useAppStore.getState>["updateStatus"];
  onClick: () => void;
}) {
  if (
    status.kind === "idle" ||
    status.kind === "checking" ||
    status.kind === "error"
  ) {
    return null;
  }

  if (status.kind === "downloading") {
    return (
      <span
        className="inline-flex items-center gap-1 tabular-nums"
        style={{ color: "var(--text-muted)" }}
        title={`Baixando Solon ${status.info.version}`}
      >
        <Download size={11} />
        {Math.round(status.progress * 100)}%
      </span>
    );
  }

  const icon =
    status.kind === "ready" ? <Check size={11} /> : <Sparkles size={11} />;
  const label =
    status.kind === "ready"
      ? `Reiniciar para ${status.info.version}`
      : `${status.info.version} disponível`;

  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:underline underline-offset-4"
      style={{ color: "var(--accent)" }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
