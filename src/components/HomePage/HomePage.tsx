import { ArrowRight, FolderOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAppStore, FileNode } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { parseDocument } from "../../lib/frontmatter";
import { UpdateBanner } from "./UpdateBanner";

/**
 * Landing minima — pagina de transicao, NAO um dashboard. Funcao unica:
 * dar contexto rapido (qual projeto, quanto ja foi escrito) e empurrar
 * pro editor com 1 clique.
 *
 * Layout: vertical centralizado, max-w-md. Hierarquia clara:
 *   1. Solon (marca pequena, masthead)
 *   2. Nome do projeto (capa do livro)
 *   3. Stats numa linha so (palavras + arquivos)
 *   4. CTA grande pra continuar / abrir
 *   5. Acoes secundarias inline minusculas
 *
 * Estados:
 *   - sem rootFolder: empty state com CTA "Abrir pasta"
 *   - com rootFolder + activeFilePath: "Continuar lendo X"
 *   - com rootFolder, sem activeFilePath: "Ir para o editor"
 */
export function HomePage() {
  const rootFolder = useAppStore((s) => s.rootFolder);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFileName = useAppStore((s) => s.activeFileName);
  const projectStats = useAppStore((s) => s.projectStats);
  const setProjectStats = useAppStore((s) => s.setProjectStats);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const openPrompt = useAppStore((s) => s.openPrompt);
  const pushToast = useAppStore((s) => s.pushToast);
  const { openFolder, createFile } = useFileSystem();

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
      // Em dev/browser puro nao da pra ler os arquivos do disco — exibe
      // so o file count, sem palavra. Melhor que esconder a linha inteira.
      setProjectStats({ wordCount: 0, fileCount: allFiles.length });
      return;
    }

    let cancelled = false;
    setProjectStats(null);

    (async () => {
      try {
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        let total = 0;
        for (const f of allFiles) {
          if (cancelled) return;
          try {
            const content = await readTextFile(f.path);
            const { body } = parseDocument(content);
            const trimmed = body.trim();
            if (trimmed) total += trimmed.split(/\s+/).length;
          } catch {
            // Arquivo ilegivel — pula sem quebrar a varredura inteira.
          }
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
    // Re-roda quando a *lista* muda — o tree em si re-renderiza com refs
    // novas a cada `refresh()`, entao essa dep cobre create/delete/rename.
  }, [allFiles, setProjectStats]);

  const goEditor = () => setActiveView("editor");

  const onNewFile = async () => {
    if (!rootFolder) {
      pushToast("info", "Abra uma pasta antes de criar arquivos.");
      return;
    }
    const name = await openPrompt({
      title: "Nova nota",
      message: "Vira o título da cena/capítulo no editor.",
      placeholder: "Ex: minha-cena",
      confirmLabel: "Criar",
    });
    if (!name) return;
    await createFile(rootFolder, name);
    if (useAppStore.getState().activeFilePath) setActiveView("editor");
  };

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{ background: "var(--bg-app)" }}
    >
      <div className="min-h-full flex items-center justify-center px-8 py-16">
        <div className="w-full max-w-md flex flex-col items-center text-center">
          <UpdateBanner />

          {/* Masthead minusculo — ancora a marca sem dominar. Mesma
              tipografia da titlebar, ligeiramente maior. */}
          <div
            className="font-serif text-sm tracking-[0.3em] uppercase mb-12"
            style={{ color: "var(--text-muted)" }}
          >
            Solon
          </div>

          {rootFolder ? (
            <ProjectHero
              folderName={folderName}
              rootFolder={rootFolder}
              stats={projectStats}
              continueLabel={continueLabel}
              onContinue={goEditor}
              onNewFile={onNewFile}
              onOpenFolder={openFolder}
            />
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
      {/* Nome do projeto — capa do livro. tracking-tight + serif bold
          empresta peso editorial sem virar logo. clamp escala no zoom da
          janela pra nao "explodir" em telas ultrawide. */}
      <h1
        className="font-serif font-bold leading-[0.95] tracking-tight mb-3"
        style={{
          color: "var(--text-primary)",
          fontSize: "clamp(2.5rem, 6vw, 4rem)",
        }}
      >
        {folderName}
      </h1>

      {/* Path completo + stats numa unica linha discreta. Em vez de
          duas linhas (path em uma, stats em outra) — economiza ruido
          vertical e mantem tudo numa tira so de "metadata". */}
      <div
        className="text-[0.78rem] mb-12 max-w-full truncate"
        style={{ color: "var(--text-muted)" }}
        title={rootFolder}
      >
        {stats === null ? (
          <span className="italic">calculando…</span>
        ) : stats.fileCount === 0 ? (
          <span className="italic">pasta vazia</span>
        ) : (
          <>
            {stats.wordCount > 0 && (
              <>
                <span className="tabular-nums">
                  {stats.wordCount.toLocaleString("pt-BR")}
                </span>{" "}
                palavras{" "}
                <span style={{ color: "var(--text-placeholder)" }}>·</span>{" "}
              </>
            )}
            <span className="tabular-nums">{stats.fileCount}</span>{" "}
            {stats.fileCount === 1 ? "arquivo" : "arquivos"}
          </>
        )}
      </div>

      {/* CTA primario. Quando ha arquivo aberto: "Continuar lendo X".
          Quando nao ha (mas tem pasta): "Ir para o editor" — usuario
          escolhe arquivo no explorador la dentro. */}
      <button
        onClick={onContinue}
        className="group inline-flex items-center gap-2.5 mb-10 transition-opacity hover:opacity-75"
        style={{ color: "var(--text-primary)" }}
      >
        <span
          className="font-serif text-xl border-b pb-1"
          style={{ borderColor: "var(--text-primary)" }}
        >
          {continueLabel ? (
            <>
              Continuar lendo{" "}
              <span className="italic" style={{ color: "var(--text-secondary)" }}>
                {continueLabel}
              </span>
            </>
          ) : (
            "Ir para o editor"
          )}
        </span>
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1"
        />
      </button>

      {/* Acoes secundarias minusculas — uma linha so, separadas por bullet.
          Pra "Novo arquivo" e "Trocar pasta" o user que precisa muito; o
          fluxo principal e o CTA acima. */}
      <nav
        className="flex items-center gap-2 text-[0.78rem]"
        style={{ color: "var(--text-muted)" }}
      >
        <button
          onClick={onNewFile}
          className="hover:underline underline-offset-4 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          Novo arquivo
        </button>
        <span style={{ color: "var(--text-placeholder)" }}>·</span>
        <button
          onClick={onOpenFolder}
          className="hover:underline underline-offset-4 transition-colors"
          style={{ color: "var(--text-secondary)" }}
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
      <h1
        className="font-serif font-bold leading-[0.95] tracking-tight mb-4"
        style={{
          color: "var(--text-primary)",
          fontSize: "clamp(2.5rem, 6vw, 4rem)",
        }}
      >
        Bem-vindo
      </h1>
      <p
        className="font-serif italic text-base mb-10 leading-relaxed"
        style={{ color: "var(--text-muted)", maxWidth: "28ch" }}
      >
        Comece abrindo uma pasta — Solon trata cada arquivo como uma cena.
      </p>
      <button
        onClick={onOpenFolder}
        className="group inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
        style={{ color: "var(--text-primary)" }}
      >
        <FolderOpen size={16} />
        <span
          className="font-serif text-xl border-b pb-1"
          style={{ borderColor: "var(--text-primary)" }}
        >
          Abrir pasta de trabalho
        </span>
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1"
        />
      </button>
    </>
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
