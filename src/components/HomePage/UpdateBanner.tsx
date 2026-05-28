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
  // Banner virou bloco brutalist alinhado com a HomePage nova. Borda
  // pesada 2px + sombra chapada que levanta no hover quando interativo
  // (downloading nao tem hover — mostra progress bar 2px no bottom).
  const interactive = !!onClick;
  const inner = (
    <div
      className="relative flex items-center gap-3 px-4 py-3 w-full transition-all"
      style={{
        background: "var(--bg-panel)",
        border: "2px solid var(--border-strong)",
        borderRadius: 0,
        color: "var(--text-secondary)",
        boxShadow: "var(--shadow-flat-sm)",
      }}
    >
      <span
        className="flex-shrink-0"
        style={{ color: "var(--accent)" }}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.92rem",
          fontStyle: "italic",
        }}
      >
        {label}
      </span>
      {trailing}
      {cta && (
        <span
          className="inline-flex items-center gap-1.5 solon-caps"
          style={{ color: "var(--text-primary)" }}
        >
          {cta}
          <ArrowRight size={12} />
        </span>
      )}
      {/* Barra de progresso 2px no bottom border quando baixando — mais
          grossa que antes pra ficar visivel com a borda nova. */}
      {typeof progress === "number" && (
        <div
          aria-hidden
          className="absolute left-0 transition-all"
          style={{
            bottom: -2,
            height: 2,
            width: `${Math.round(progress * 100)}%`,
            background: "var(--accent)",
          }}
        />
      )}
    </div>
  );

  if (!interactive) {
    return <div className="relative mb-10 w-full max-w-md">{inner}</div>;
  }

  return (
    <button
      onClick={onClick}
      className="relative w-full max-w-md text-left mb-10 transition-transform"
      style={{ cursor: "default" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget.firstChild as HTMLElement;
        if (el) {
          el.style.transform = "translate(-1px, -1px)";
          el.style.boxShadow = "3px 3px 0 var(--border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget.firstChild as HTMLElement;
        if (el) {
          el.style.transform = "";
          el.style.boxShadow = "var(--shadow-flat-sm)";
        }
      }}
    >
      {inner}
    </button>
  );
}
