import { Feather } from "lucide-react";

interface Props {
  size?: "sm" | "lg";
  muted?: boolean;
}

export function SolonLogo({ size = "sm", muted }: Props) {
  const large = size === "lg";
  const markSize = large ? 38 : 20;
  const iconSize = large ? 20 : 12;

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center rounded-md"
        style={{
          width: markSize,
          height: markSize,
          color: "var(--accent)",
          background: "var(--accent-soft)",
          border: "1px solid var(--border)",
          boxShadow: large ? "var(--shadow-sm)" : undefined,
        }}
      >
        <Feather size={iconSize} strokeWidth={1.8} />
      </span>
      <span
        className="font-serif font-bold"
        style={{
          color: muted ? "var(--text-muted)" : "var(--text-primary)",
          fontSize: large ? "1.5rem" : "0.92rem",
          lineHeight: 1,
          letterSpacing: 0,
        }}
      >
        Solon
      </span>
    </span>
  );
}
