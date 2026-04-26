import { Sparkles, Check, Download, ArrowRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/**
 * Banner discreto que aparece na HomePage quando ha update.
 *
 * Tres apresentacoes:
 *  - `available`: convida a abrir o dialog (release notes + acoes).
 *  - `downloading`: mostra progress inline (sem call to action).
 *  - `ready`: convida a reiniciar.
 *
 * Em `idle/checking/error`, retorna null (nao polui a home).
 */
export function UpdateBanner() {
  const status = useAppStore((s) => s.updateStatus);
  const open = useAppStore((s) => s.openUpdateDialog);

  if (
    status.kind === "idle" ||
    status.kind === "checking" ||
    status.kind === "error"
  ) {
    return null;
  }

  if (status.kind === "downloading") {
    const pct = Math.round(status.progress * 100);
    return (
      <BannerShell
        icon={<Download size={14} />}
        label={
          <>
            Baixando Solon{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {status.info.version}
            </span>
          </>
        }
        trailing={
          <span
            className="text-[0.75rem] tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {pct}%
          </span>
        }
        progress={status.progress}
      />
    );
  }

  if (status.kind === "ready") {
    return (
      <BannerShell
        icon={<Check size={14} />}
        label={
          <>
            <span style={{ color: "var(--text-primary)" }}>
              Solon {status.info.version}
            </span>{" "}
            pronto pra reiniciar
          </>
        }
        onClick={open}
        cta="Reiniciar"
      />
    );
  }

  // available
  return (
    <BannerShell
      icon={<Sparkles size={14} />}
      label={
        <>
          Nova edição:{" "}
          <span style={{ color: "var(--text-primary)" }}>
            Solon {status.info.version}
          </span>
        </>
      }
      onClick={open}
      cta="Ler notas"
    />
  );
}

function BannerShell({
  icon,
  label,
  onClick,
  cta,
  trailing,
  progress,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  cta?: string;
  trailing?: React.ReactNode;
  progress?: number;
}) {
  const interactive = !!onClick;
  const inner = (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors w-full"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      <span
        className="flex-shrink-0"
        style={{ color: "var(--accent)" }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="font-serif text-[0.95rem] flex-1 truncate">
        {label}
      </span>
      {trailing}
      {cta && (
        <span
          className="inline-flex items-center gap-1 text-[0.78rem] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {cta}
          <ArrowRight size={12} />
        </span>
      )}
      {/* Barra de progresso fina embutida no bottom border quando baixando. */}
      {typeof progress === "number" && (
        <div
          aria-hidden
          className="absolute bottom-0 left-0 h-px transition-all"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: "var(--accent)",
          }}
        />
      )}
    </div>
  );

  if (!interactive) {
    return <div className="relative mb-8">{inner}</div>;
  }

  return (
    <button
      onClick={onClick}
      className="relative w-full text-left mb-8 hover:opacity-90 transition-opacity"
    >
      {inner}
    </button>
  );
}
