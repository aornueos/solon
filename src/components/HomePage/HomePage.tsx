import { FolderOpen, LayoutGrid, FilePlus, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";

/**
 * Landing page do Solon. Aparece no boot (activeView === "home") e quando
 * o usuario clica no wordmark "Solon" na titlebar.
 *
 * Layout: frontispício editorial em duas colunas — esquerda e o "miolo"
 * da marca (wordmark gigante, epigrafe, pasta atual, ações inline como
 * texto-link no estilo de sumario de revista); direita e a lista de
 * arquivos da pasta como um indice serif. Sem card-grid generico.
 *
 * Em telas estreitas, vira coluna unica empilhada.
 */
export function HomePage() {
  const rootFolder = useAppStore((s) => s.rootFolder);
  const fileTree = useAppStore((s) => s.fileTree);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { openFolder, openFile } = useFileSystem();

  const allFiles = useMemo(() => flattenFiles(fileTree), [fileTree]);
  const folderName = useMemo(() => {
    if (!rootFolder) return null;
    const parts = rootFolder.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || rootFolder;
  }, [rootFolder]);

  const goEditor = () => setActiveView("editor");
  const goCanvas = () => setActiveView("canvas");

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{ background: "var(--bg-app)" }}
    >
      <div className="min-h-full flex items-center justify-center px-12 py-16">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-16 md:gap-24 items-start">
          {/* ─────────── COLUNA ESQUERDA — frontispício ─────────── */}
          <section className="flex flex-col">
            {/* Eyebrow minusculo, tipografia de revista */}
            <div
              className="text-[0.65rem] uppercase tracking-[0.25em] mb-6"
              style={{ color: "var(--text-muted)" }}
            >
              {rootFolder ? "Em trabalho" : "Bem-vindo"}
            </div>

            {/* Wordmark gigante */}
            <h1
              className="font-serif font-bold leading-[0.95] tracking-tight mb-5"
              style={{
                color: "var(--text-primary)",
                fontSize: "clamp(4rem, 9vw, 7rem)",
              }}
            >
              Solon
            </h1>

            {/* Regra decorativa fina */}
            <div
              className="h-px w-16 mb-5"
              style={{ background: "var(--text-primary)", opacity: 0.4 }}
            />

            {/* Epigrafe italico */}
            <p
              className="font-serif italic leading-snug mb-10"
              style={{
                color: "var(--text-secondary)",
                fontSize: "clamp(1.05rem, 1.4vw, 1.25rem)",
                maxWidth: "32ch",
              }}
            >
              Um editor para quem escreve devagar — cenas, frontmatter,
              storyboard. Tudo em texto puro.
            </p>

            {/* Status: pasta atual ou call-to-action */}
            {rootFolder ? (
              <div className="mb-10">
                <div
                  className="text-[0.65rem] uppercase tracking-[0.2em] mb-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Pasta
                </div>
                <div
                  className="font-serif text-xl mb-1 truncate"
                  style={{ color: "var(--text-primary)" }}
                  title={rootFolder}
                >
                  {folderName}
                </div>
                <button
                  onClick={openFolder}
                  className="text-[0.78rem] underline-offset-4 hover:underline transition-opacity"
                  style={{ color: "var(--text-muted)" }}
                >
                  Trocar pasta…
                </button>
              </div>
            ) : (
              <div className="mb-10">
                <button
                  onClick={openFolder}
                  className="group inline-flex items-center gap-2 transition-opacity"
                  style={{ color: "var(--text-primary)" }}
                >
                  <FolderOpen size={16} />
                  <span className="font-serif text-lg border-b pb-0.5"
                    style={{ borderColor: "var(--text-primary)" }}>
                    Abrir uma pasta de trabalho
                  </span>
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </button>
              </div>
            )}

            {/* Acoes inline — sumario tipografico, nao cards */}
            {rootFolder && (
              <nav className="flex flex-wrap items-center gap-x-1 gap-y-2 font-serif text-[0.95rem]">
                <InlineLink onClick={goEditor} icon={<ArrowRight size={13} />}>
                  Continuar no editor
                </InlineLink>
                <Sep />
                <InlineLink onClick={goCanvas} icon={<LayoutGrid size={12} />}>
                  Abrir canvas
                </InlineLink>
                <Sep />
                <InlineLink onClick={goEditor} icon={<FilePlus size={12} />}>
                  Novo arquivo
                </InlineLink>
              </nav>
            )}
          </section>

          {/* ─────────── COLUNA DIREITA — indice de arquivos ─────────── */}
          <aside className="flex flex-col">
            <div
              className="flex items-baseline justify-between mb-5 pb-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <h2
                className="font-serif text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                Sumário
              </h2>
              {allFiles.length > 0 && (
                <span
                  className="text-[0.7rem] tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {allFiles.length}{" "}
                  {allFiles.length === 1 ? "arquivo" : "arquivos"}
                </span>
              )}
            </div>

            {allFiles.length === 0 ? (
              <div
                className="font-serif italic text-[0.95rem] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {rootFolder
                  ? "Esta pasta ainda não tem arquivos de texto."
                  : "Os arquivos da pasta aberta aparecerão aqui — como um sumário de livro."}
              </div>
            ) : (
              <ol className="flex flex-col">
                {allFiles.slice(0, 12).map((f, i) => (
                  <li key={f.path}>
                    <button
                      onClick={async () => {
                        await openFile(f.path, f.name);
                        setActiveView("editor");
                      }}
                      className="w-full group flex items-baseline gap-4 py-2.5 text-left transition-colors"
                      style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <span
                        className="text-[0.7rem] tabular-nums w-6 flex-shrink-0 pt-0.5"
                        style={{ color: "var(--text-placeholder)" }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="font-serif text-[1.05rem] flex-1 truncate transition-colors"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {f.name.replace(/\.(md|txt)$/, "")}
                      </span>
                      <ArrowRight
                        size={13}
                        className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 mt-1"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    </button>
                  </li>
                ))}
                {allFiles.length > 12 && (
                  <li
                    className="pt-3 text-[0.75rem] italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    + {allFiles.length - 12} no explorador
                  </li>
                )}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function InlineLink({
  children,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-1 py-0.5 rounded transition-colors hover:underline underline-offset-4"
      style={{ color: "var(--text-primary)" }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Sep() {
  return (
    <span
      aria-hidden
      className="px-1 select-none"
      style={{ color: "var(--text-placeholder)" }}
    >
      ·
    </span>
  );
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    if (n.children) out.push(...flattenFiles(n.children));
  }
  return out;
}
