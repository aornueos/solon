import { ArrowRight, FolderOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { parseDocument } from "../../lib/frontmatter";
import { UpdateBanner } from "./UpdateBanner";

/**
 * Landing editorial centrada num eixo vertical (Quiet Editorial):
 *
 *   PROJETO · METADADOS                  (small-caps)
 *   ─────────────────                     (hairline sutil)
 *
 *   NOME DO PROJETO                       (display serif grande)
 *
 *   ─────  ❦  ─────                       (ornamento hairline)
 *
 *   ⟶ Continuar {arquivo}                 (CTA pill hairline)
 *
 *   RECENTES
 *   I.  arquivo                           (roman + serif italic + path)
 *   II. arquivo
 *
 *   Novo arquivo  ·  Trocar pasta         (acoes secundarias)
 *
 * Metadados em caps lideram; o nome vem em display serif embaixo. Os
 * recents sao listagem numerada em romanos. Estado vazio segue a mesma
 * gramatica.
 */
export function HomePage() {
  const rootFolder = useAppStore((s) => s.rootFolder);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFileName = useAppStore((s) => s.activeFileName);
  const projectStats = useAppStore((s) => s.projectStats);
  const setProjectStats = useAppStore((s) => s.setProjectStats);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setEditorPageLayout = useAppStore((s) => s.setEditorPageLayout);
  const openPrompt = useAppStore((s) => s.openPrompt);
  const pushToast = useAppStore((s) => s.pushToast);
  const recentFiles = useAppStore((s) => s.recentFiles);
  const { openFolder, createFile, openFile } = useFileSystem();

  const allFiles = useMemo(() => flattenFiles(fileTree), [fileTree]);
  const folderName = useMemo(() => {
    if (!rootFolder) return null;
    const parts = rootFolder.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || rootFolder;
  }, [rootFolder]);

  const continueLabel = activeFileName
    ? activeFileName.replace(/\.(md|txt)$/, "")
    : null;

  // Computa stats agregados varrendo .md/.txt da pasta. Roda quando a
  // fileTree muda (boot, troca de pasta, create/delete). Cancellable
  // pra nao race se user trocar de pasta no meio da varredura.
  useEffect(() => {
    if (allFiles.length === 0) {
      setProjectStats(null);
      return;
    }
    const isTauri =
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__TAURI_INTERNALS__ !== undefined;
    if (!isTauri) {
      setProjectStats({ wordCount: 0, fileCount: allFiles.length });
      return;
    }

    let cancelled = false;
    setProjectStats(null);

    (async () => {
      try {
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const CHUNK = 16;
        let total = 0;
        for (let i = 0; i < allFiles.length; i += CHUNK) {
          if (cancelled) return;
          const slice = allFiles.slice(i, i + CHUNK);
          const results = await Promise.all(
            slice.map(async (f) => {
              try {
                const content = await readTextFile(f.path);
                const { body } = parseDocument(content);
                const trimmed = body.trim();
                return trimmed ? trimmed.split(/\s+/).length : 0;
              } catch {
                return 0;
              }
            }),
          );
          if (cancelled) return;
          for (const n of results) total += n;
        }
        if (!cancelled) {
          setProjectStats({ wordCount: total, fileCount: allFiles.length });
        }
      } catch {
        if (!cancelled) {
          setProjectStats({ wordCount: 0, fileCount: allFiles.length });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allFiles, setProjectStats]);

  const openFreeEditor = () => {
    setEditorPageLayout("fluid");
    setActiveView("editor");
  };

  const onNewFile = async () => {
    if (!rootFolder) {
      pushToast("info", "Abra uma pasta antes de criar arquivos.");
      return;
    }
    const name = await openPrompt({
      title: "Nova nota",
      message: "Vira o título da cena/capítulo na escrita.",
      placeholder: "Ex: minha-cena",
      confirmLabel: "Criar",
    });
    if (!name) return;
    await createFile(rootFolder, name);
    if (useAppStore.getState().activeFilePath) openFreeEditor();
  };

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{ background: "var(--bg-app)" }}
    >
      <div className="min-h-full flex items-center justify-center px-8 py-16">
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          <UpdateBanner />

          {rootFolder ? (
            <>
              <ProjectHero
                folderName={folderName}
                rootFolder={rootFolder}
                stats={projectStats}
                continueLabel={continueLabel}
                onContinue={openFreeEditor}
                onNewFile={onNewFile}
                onOpenFolder={openFolder}
              />
              {recentFiles.length > 0 && (
                <RecentsList
                  files={recentFiles}
                  rootFolder={rootFolder}
                  onOpen={(path, name) => {
                    void openFile(path, name, { tab: "replace" });
                    openFreeEditor();
                  }}
                />
              )}
            </>
          ) : (
            <EmptyHero onOpenFolder={openFolder} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectHero({
  folderName,
  rootFolder,
  stats,
  continueLabel,
  onContinue,
  onNewFile,
  onOpenFolder,
}: {
  folderName: string | null;
  rootFolder: string;
  stats: { wordCount: number; fileCount: number } | null;
  continueLabel: string | null;
  onContinue: () => void;
  onNewFile: () => void;
  onOpenFolder: () => void;
}) {
  return (
    <>
      {/* Meta-label acima do titulo: "PROJETO · 3 ARQUIVOS · 12.450 PALAVRAS".
          Small-caps (.solon-caps, Inter). Ficha de metadados antes do nome. */}
      <div
        className="solon-caps mb-5 flex items-center gap-3"
        style={{ color: "var(--text-muted)" }}
        title={rootFolder}
      >
        <span>Projeto</span>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 4,
            height: 4,
            background: "var(--text-placeholder)",
            borderRadius: "var(--radius-pill)",
          }}
        />
        {stats === null ? (
          <span className="italic" style={{ textTransform: "none" }}>
            calculando…
          </span>
        ) : stats.fileCount === 0 ? (
          <span className="italic" style={{ textTransform: "none" }}>
            pasta vazia
          </span>
        ) : (
          <>
            <span className="tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
              {stats.fileCount.toLocaleString("pt-BR")}
            </span>
            <span style={{ marginLeft: "-0.35em" }}>
              {stats.fileCount === 1 ? "Arquivo" : "Arquivos"}
            </span>
            {stats.wordCount > 0 && (
              <>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 4,
                    height: 4,
                    background: "var(--text-placeholder)",
                    borderRadius: "var(--radius-pill)",
                  }}
                />
                <span className="tabular-nums">
                  {stats.wordCount.toLocaleString("pt-BR")}
                </span>
                <span style={{ marginLeft: "-0.35em" }}>Palavras</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Nome do projeto em display serif (.solon-display) — consome
          --font-display com tracking negativo. clamp escala no zoom da
          janela sem explodir em ultrawide. */}
      <h1
        className="solon-display mb-6"
        style={{ fontSize: "clamp(2.75rem, 7.5vw, 5rem)" }}
      >
        {folderName}
      </h1>

      {/* Ornamento — ❦ central entre hairlines suaves. Marca a transicao
          entre "ficha" e "CTA". Sem isso a hero parece dois blocos
          empilhados sem juncao. */}
      <div
        className="solon-divider-ornate w-full max-w-[18rem] mb-10"
        aria-hidden
      >
        <span style={{ color: "var(--accent)" }}>❦</span>
      </div>

      {/* CTA editorial (.solon-cta) — pill hairline que preenche
          suavemente no hover. Texto em serif, sem caps gritante. */}
      <button
        onClick={onContinue}
        className="solon-cta mb-10 group"
        style={{ maxWidth: "min(92vw, 480px)" }}
        title={
          continueLabel
            ? `Continuar lendo ${continueLabel}`
            : "Ir para a escrita"
        }
      >
        <span style={{ color: "var(--accent)" }} aria-hidden>
          ⟶
        </span>
        <span className="truncate">
          {continueLabel ? (
            <>
              Continuar{" "}
              <span
                style={{
                  fontStyle: "italic",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 500,
                }}
              >
                {continueLabel}
              </span>
            </>
          ) : (
            "Ir para a escrita"
          )}
        </span>
      </button>

      {/* Acoes secundarias — small-caps serif, separadas por losango.
          Mesmo vocabulario da meta-label de cima pra fechar a hierarquia. */}
      <nav className="solon-caps flex items-center gap-3">
        <button
          onClick={onNewFile}
          className="transition-colors hover:underline underline-offset-[6px]"
          style={{
            color: "var(--text-secondary)",
            background: "transparent",
            textDecorationThickness: "1.5px",
          }}
        >
          Novo arquivo
        </button>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 4,
            height: 4,
            background: "var(--text-placeholder)",
            borderRadius: "var(--radius-pill)",
          }}
        />
        <button
          onClick={onOpenFolder}
          className="transition-colors hover:underline underline-offset-[6px]"
          style={{
            color: "var(--text-secondary)",
            background: "transparent",
            textDecorationThickness: "1.5px",
          }}
        >
          Trocar pasta
        </button>
      </nav>
    </>
  );
}

function EmptyHero({ onOpenFolder }: { onOpenFolder: () => void }) {
  return (
    <>
      <div
        className="solon-caps mb-5"
        style={{ color: "var(--text-muted)" }}
      >
        Solon — Editor de Escrita
      </div>
      <h1
        className="solon-display mb-6"
        style={{ fontSize: "clamp(2.75rem, 7.5vw, 5rem)" }}
      >
        Bem-vindo
      </h1>
      <div
        className="solon-divider-ornate w-full max-w-[18rem] mb-10"
        aria-hidden
      >
        <span style={{ color: "var(--accent)" }}>❦</span>
      </div>
      <p
        className="italic text-base mb-10 leading-relaxed"
        style={{ color: "var(--text-muted)", maxWidth: "34ch" }}
      >
        Cada arquivo é uma cena. Cada pasta, um livro. Comece abrindo um
        diretório de trabalho.
      </p>
      <button onClick={onOpenFolder} className="solon-cta">
        <FolderOpen size={16} aria-hidden />
        <span>Abrir pasta</span>
        <ArrowRight size={16} aria-hidden />
      </button>
    </>
  );
}

/**
 * Lista catalografica dos ultimos arquivos abertos. Recents agora vem
 * em formato editorial: plaqueta de seção + linhas numeradas em romanos
 * + nome em serif italic. Filtra entries cujo path nao começa com o
 * rootFolder atual (recents de projetos anteriores nao deveriam vazar
 * pra um projeto diferente). Cap visual em 5 entries.
 */
function RecentsList({
  files,
  rootFolder,
  onOpen,
}: {
  files: { path: string; name: string }[];
  rootFolder: string;
  onOpen: (path: string, name: string) => void;
}) {
  const root = rootFolder.replace(/\\/g, "/").replace(/\/+$/, "");
  const scoped = files
    .filter((f) => {
      const p = f.path.replace(/\\/g, "/");
      return p === root || p.startsWith(`${root}/`);
    })
    .slice(0, 5);
  if (scoped.length === 0) return null;

  return (
    <div className="mt-16 w-full max-w-md">
      {/* Plaqueta de secao centralizada. Mesma plaqueta usada nos painéis
          do chrome — vocabulario consistente. */}
      <div className="flex justify-center mb-5">
        <span className="solon-plaque">Recentes</span>
      </div>

      <ul className="space-y-px">
        {scoped.map((f, idx) => {
          const display = f.name.replace(/\.(md|txt)$/i, "");
          return (
            <li key={f.path}>
              <button
                onClick={() => onOpen(f.path, f.name)}
                className="group/recent w-full flex items-center gap-3.5 px-3 py-2 text-left transition-colors"
                style={{
                  background: "transparent",
                  color: "var(--text-secondary)",
                  borderRadius: "var(--radius)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
                title={f.path}
              >
                <span
                  className="solon-roman flex-shrink-0"
                  style={{ width: "2rem", textAlign: "right" }}
                  aria-hidden
                >
                  {toRoman(idx + 1)}.
                </span>
                <span
                  className="truncate flex-1"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "0.95rem",
                    fontStyle: "italic",
                    color: "var(--text-primary)",
                  }}
                >
                  {display}
                </span>
                <span
                  className="flex-shrink-0 opacity-0 group-hover/recent:opacity-100 transition-opacity"
                  style={{ color: "var(--text-placeholder)", fontSize: "0.85rem" }}
                  aria-hidden
                >
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Conversao decimal → algarismo romano. Limite implicito de ~10 itens
 * (lista de Recents tem cap em 5 visual). Sem dependencia externa.
 */
function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    if (n.children) out.push(...flattenFiles(n.children));
  }
  return out;
}
