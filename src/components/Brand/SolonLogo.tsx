import { Feather } from "lucide-react";

interface Props {
  size?: "sm" | "lg";
  muted?: boolean;
}

/**
 * Marca composta — selo brutalist (caixa quadrada com borda 2px e
 * feather em accent) + wordmark caps espaçadas. Coerente com a
 * .solon-wordmark usada na Titlebar. Size "lg" pra splash/about,
 * "sm" pra inline em dialogs.
 */
export function SolonLogo({ size = "sm", muted }: Props) {
  const large = size === "lg";
  const markSize = large ? 40 : 22;
  const iconSize = large ? 22 : 13;

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: markSize,
          height: markSize,
          color: "var(--accent)",
          background: "var(--accent-soft)",
          border: "2px solid var(--border-strong)",
          borderRadius: 0,
          boxShadow: large ? "var(--shadow-flat-sm)" : undefined,
        }}
      >
        <Feather size={iconSize} strokeWidth={1.8} />
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          color: muted ? "var(--text-muted)" : "var(--text-primary)",
          fontSize: large ? "1.6rem" : "0.95rem",
          lineHeight: 1,
          letterSpacing: large ? "0.18em" : "0.22em",
          textTransform: "uppercase",
        }}
      >
        Solon
      </span>
    </span>
  );
}
