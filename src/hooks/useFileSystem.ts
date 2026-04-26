import { useCallback } from "react";
import { useAppStore, FileNode } from "../store/useAppStore";
import { useCanvasStore } from "../store/useCanvasStore";
import { parseDocument } from "../lib/frontmatter";
import { renameCanvasSidecar, deleteCanvasSidecar } from "../lib/canvas";

// No ambiente web (dev sem Tauri), usa mock
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Mensagem humana a partir de um erro arbitrário do Tauri. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "erro desconhecido";
  }
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function parentOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

export function useFileSystem() {
  const {
    rootFolder,
    activeFilePath,
    setRootFolder,
    setFileTree,
    setActiveFile,
  } = useAppStore();

  const openFolder = useCallback(async () => {
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false });
        if (selected && typeof selected === "string") {
          setRootFolder(selected);
          const tree = await buildFileTree(selected);
          setFileTree(tree);
        }
      } catch (err) {
        console.error("Erro ao abrir pasta:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao abrir pasta: ${describeError(err)}`);
      }
    } else {
      // Mock para dev no browser
      const mockTree: FileNode[] = [
        {
          name: "Meu Romance",
          path: "/mock/romance",
          type: "folder",
          expanded: true,
          children: [
            {
              name: "Parte I — O Início",
              path: "/mock/romance/parte1",
              type: "folder",
              expanded: false,
              children: [
                { name: "Capítulo 01.md", path: "/mock/romance/parte1/cap01.md", type: "file" },
                { name: "Capítulo 02.md", path: "/mock/romance/parte1/cap02.md", type: "file" },
              ],
            },
            { name: "Notas de Personagens.md", path: "/mock/romance/personagens.md", type: "file" },
            { name: "Worldbuilding.md", path: "/mock/romance/world.md", type: "file" },
          ],
        },
      ];
      setRootFolder("/mock/romance");
      setFileTree(mockTree);
    }
  }, [setRootFolder, setFileTree]);

  const openFile = useCallback(
    async (path: string, name: string) => {
      if (isTauri) {
        try {
          const { readTextFile } = await import("@tauri-apps/plugin-fs");
          const content = await readTextFile(path);
          const { meta, body } = parseDocument(content);
          setActiveFile(path, name, body, meta);
        } catch (err) {
          console.error("Erro ao abrir arquivo:", err);
          useAppStore
            .getState()
            .pushToast(
              "error",
              `Não foi possível abrir ${name}: ${describeError(err)}`,
            );
        }
      } else {
        const mockContent: Record<string, string> = {
          "/mock/romance/parte1/cap01.md": `# Capítulo 1 — O Chamado

A manhã chegou antes do esperado. Elara abriu os olhos para o teto de pedra fria e sentiu, como sempre, o peso do silêncio.

## A Aldeia

Nenhum som vinha do lado de fora — nem o mugido das vacas, nem o chiado das rodas d'água. Apenas vento.

> "Você não vai durar nem um dia fora dessas muralhas," dissera o ancião.

Ela se levantou mesmo assim.

---

### Cena 2

O mercado estava vazio quando ela chegou. Não por falta de vendedores — haviam muitos, com suas barracas coloridas e vozes altas — mas porque ninguém a via. Nunca a viam.

Elara era a sombra que a aldeia havia aprendido a ignorar.`,
          "/mock/romance/personagens.md": `# Notas de Personagens

## Elara Voss

- **Idade:** 24
- **Papel:** Protagonista
- **Motivação:** Descobrir a verdade sobre o desaparecimento da mãe

## Doran

- **Idade:** 31
- **Papel:** Antagonista / aliado ambíguo
- **Motivação:** Desconhecida`,
          "/mock/romance/world.md": `# Worldbuilding

## A Cidade de Arken

Arken foi construída sobre as ruínas de uma civilização mais antiga. As fundações das casas mais velhas ainda exibem inscrições que ninguém consegue decifrar.

### Política

O Conselho dos Seis governa a cidade há três gerações. Cada membro representa um distrito.`,
        };

        const content =
          mockContent[path] ||
          `# ${name.replace(".md", "")}\n\nComece a escrever aqui...`;
        const { meta, body } = parseDocument(content);
        setActiveFile(path, name, body, meta);
      }
    },
    [setActiveFile]
  );

  const saveFile = useCallback(
    async (path: string, content: string) => {
      if (isTauri) {
        try {
          const { writeTextFile } = await import("@tauri-apps/plugin-fs");
          await writeTextFile(path, content);
        } catch (err) {
          console.error("Erro ao salvar arquivo:", err);
          // Save falha silenciosa = usuário acha que salvou e perde o
          // trabalho. Surface obrigatório: o toast fica 8s, mais longo que
          // o default, pra dar tempo de agir antes de confiar que salvou.
          const name = path.split(/[\\/]/).pop() ?? path;
          useAppStore
            .getState()
            .pushToast(
              "error",
              `Falha ao salvar ${name}: ${describeError(err)}`,
              8000,
            );
        }
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!isTauri || !rootFolder) return;
    const tree = await buildFileTree(rootFolder);
    setFileTree(tree);
  }, [rootFolder, setFileTree]);

  const restoreLastFolder = useCallback(async () => {
    if (!isTauri) return;
    try {
      const last = localStorage.getItem("solon:rootFolder");
      if (!last) return;
      const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");
      if (!(await exists(last))) {
        localStorage.removeItem("solon:rootFolder");
        localStorage.removeItem("solon:lastFile");
        return;
      }
      setRootFolder(last);
      const tree = await buildFileTree(last);
      setFileTree(tree);

      // Restaura tambem o ultimo arquivo aberto. Importante: NAO mudamos
      // activeView aqui — a HomePage continua sendo o landing inicial,
      // mas com `activeFilePath` ja settado o botao "Continuar" tem alvo.
      // Silent: erro de leitura limpa a chave pra evitar pop-up vermelho
      // toda vez que o app abre apos um arquivo ter sido movido/apagado.
      const lastFile = localStorage.getItem("solon:lastFile");
      if (lastFile) {
        try {
          if (await exists(lastFile)) {
            const content = await readTextFile(lastFile);
            const { meta, body } = parseDocument(content);
            const name = lastFile.split(/[\\/]/).pop() ?? lastFile;
            useAppStore.getState().setActiveFile(lastFile, name, body, meta);
          } else {
            localStorage.removeItem("solon:lastFile");
          }
        } catch {
          localStorage.removeItem("solon:lastFile");
        }
      }
    } catch (err) {
      console.error("Erro ao restaurar pasta:", err);
    }
  }, [setRootFolder, setFileTree]);

  const createFile = useCallback(
    async (parentDir: string, name: string) => {
      if (!isTauri) return;
      const finalName = name.endsWith(".md") || name.endsWith(".txt") ? name : `${name}.md`;
      const full = joinPath(parentDir, finalName);
      try {
        const { writeTextFile, exists } = await import("@tauri-apps/plugin-fs");
        if (await exists(full)) {
          useAppStore
            .getState()
            .pushToast("error", "Já existe um arquivo com esse nome.");
          return;
        }
        // Arquivo nasce em branco — sem heading auto-injetado. O editor
        // cuida da experiencia inicial via Placeholder ("Comece a escrever..."),
        // o que e mais respeitoso pra ficcao: nem sempre a primeira linha
        // e um titulo de capitulo (cena curta, fragmento, nota).
        await writeTextFile(full, "");
        await refresh();
        await openFile(full, finalName);
      } catch (err) {
        console.error("Erro ao criar arquivo:", err);
        useAppStore
          .getState()
          .pushToast(
            "error",
            `Erro ao criar arquivo: ${describeError(err)}`,
          );
      }
    },
    [refresh, openFile]
  );

  const createFolder = useCallback(
    async (parentDir: string, name: string) => {
      if (!isTauri) return;
      const full = joinPath(parentDir, name);
      try {
        const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
        if (await exists(full)) {
          useAppStore
            .getState()
            .pushToast("error", "Já existe uma pasta com esse nome.");
          return;
        }
        await mkdir(full, { recursive: false });
        await refresh();
      } catch (err) {
        console.error("Erro ao criar pasta:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao criar pasta: ${describeError(err)}`);
      }
    },
    [refresh]
  );

  const renameNode = useCallback(
    async (oldPath: string, newName: string) => {
      if (!isTauri) return;
      const parent = parentOf(oldPath);
      const newPath = joinPath(parent, newName);
      if (newPath === oldPath) return;
      try {
        const { rename, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
        if (await exists(newPath)) {
          useAppStore
            .getState()
            .pushToast("error", "Já existe um item com esse nome.");
          return;
        }
        await rename(oldPath, newPath);
        // Sidecar canvas segue junto com o arquivo
        await renameCanvasSidecar(oldPath, newPath);
        // Reaponta scene cards de outros canvases para o novo caminho
        useCanvasStore.getState().rewireScenePath(oldPath, newPath);
        await refresh();
        // Se renomeou o arquivo aberto, reabre com novo caminho
        if (activeFilePath === oldPath) {
          const content = await readTextFile(newPath);
          const { meta, body } = parseDocument(content);
          setActiveFile(newPath, newName, body, meta);
        }
      } catch (err) {
        console.error("Erro ao renomear:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao renomear: ${describeError(err)}`);
      }
    },
    [refresh, activeFilePath, setActiveFile]
  );

  const deleteNode = useCallback(
    async (path: string, isFolder: boolean) => {
      if (!isTauri) return;
      try {
        const { remove } = await import("@tauri-apps/plugin-fs");
        await remove(path, isFolder ? { recursive: true } : undefined);
        if (!isFolder) await deleteCanvasSidecar(path);
        await refresh();
        if (activeFilePath === path || (isFolder && activeFilePath?.startsWith(path))) {
          // Limpa arquivo ativo se foi removido
          useAppStore.setState({
            activeFilePath: null,
            activeFileName: null,
            fileBody: "",
            sceneMeta: {},
            headings: [],
            wordCount: 0,
            charCount: 0,
          });
        }
      } catch (err) {
        console.error("Erro ao excluir:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao excluir: ${describeError(err)}`);
      }
    },
    [refresh, activeFilePath]
  );

  return {
    openFolder,
    openFile,
    saveFile,
    refresh,
    restoreLastFolder,
    createFile,
    createFolder,
    renameNode,
    deleteNode,
  };
}

async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  if (!isTauri) return [];
  try {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const entries = await readDir(dirPath);
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (entry.name?.startsWith(".")) continue;
      const fullPath = joinPath(dirPath, entry.name || "");
      if ("isDirectory" in entry ? entry.isDirectory : (entry as any).children !== undefined) {
        const children = await buildFileTree(fullPath);
        nodes.push({
          name: entry.name || "",
          path: fullPath,
          type: "folder",
          expanded: false,
          children,
        });
      } else if (entry.name?.endsWith(".md") || entry.name?.endsWith(".txt")) {
        nodes.push({ name: entry.name || "", path: fullPath, type: "file" });
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}
