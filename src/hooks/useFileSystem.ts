import { useCallback } from "react";
import { useAppStore, FileNode, isUntitledPath } from "../store/useAppStore";
import { useCanvasStore } from "../store/useCanvasStore";
import { parseDocument, serializeDocument } from "../lib/frontmatter";
import { renameCanvasSidecar, deleteCanvasSidecar } from "../lib/canvas";
import { createSnapshotBeforeWrite } from "../lib/localHistory";
import { flushEditor } from "../lib/editorRef";
import { scanRecoveryDrafts } from "../lib/crashRecovery";
import { atomicWriteTextFile } from "../lib/atomicWrite";
import { clearImageUrlCache } from "../lib/canvasImages";
import {
  NOTE_FILE_RE,
  assertInsideProject,
  assertProjectNotePath,
  isProjectNotePath,
  isSafeEntryName,
} from "../lib/pathSecurity";
import {
  applyOrder,
  loadOrder,
  relPath,
  removeFolderFromOrder,
  removeFromOrder,
  renameFolderInOrder,
  renameInOrder,
  reorderInFolder,
  saveOrder,
} from "../lib/sidebarOrder";
import { isTauriRuntime } from "../lib/runtime";
import { loadExpandedFolders } from "../lib/expandedFolders";

const IGNORED_TREE_DIRS = new Set(["node_modules", "target", "dist", "out"]);
const MAX_TREE_DEPTH = 24;

type OpenFileTabMode = "new" | "replace" | "preserve";
export interface OpenFileOptions {
  tab?: OpenFileTabMode;
}

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

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function relativeInside(path: string, root: string): string | null {
  const p = normalizedPath(path);
  const r = normalizedPath(root);
  if (p === r) return "";
  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : null;
}

function isSameOrDescendant(path: string, root: string): boolean {
  return relativeInside(path, root) !== null;
}

function joinRelative(root: string, relative: string): string {
  if (!relative) return root;
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return joinPath(root, relative.replace(/[\\/]/g, sep));
}

function rejectUnsafeName(name: string, kind: "file" | "folder"): boolean {
  if (isSafeEntryName(name, kind)) return false;
  useAppStore
    .getState()
    .pushToast(
      "error",
      kind === "file"
        ? "Use um nome de arquivo .md/.txt sem caracteres especiais."
        : "Use um nome de pasta sem caracteres especiais.",
    );
  return true;
}

function findNodeType(nodes: FileNode[], path: string): FileNode["type"] | null {
  const target = normalizedPath(path);
  for (const node of nodes) {
    if (normalizedPath(node.path) === target) return node.type;
    if (node.children) {
      const found = findNodeType(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function useFileSystem() {
  // Seletores granulares: `useAppStore()` cru re-rodava ESTE hook (e
  // recriava todos os useCallbacks abaixo) a cada keystroke. Como
  // varios componentes consomem este hook (Sidebar, HomePage, StatusBar,
  // CommandPalette, TabBar, App), o blast radius era enorme — invalidar
  // os callbacks invalidava todos os useEffects/useMemo dependentes.
  const rootFolder = useAppStore((s) => s.rootFolder);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const setRootFolder = useAppStore((s) => s.setRootFolder);
  const setFileTree = useAppStore((s) => s.setFileTree);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const setSidebarOrder = useAppStore((s) => s.setSidebarOrder);

  const openFile = useCallback(
    async (path: string, name: string, options: OpenFileOptions = {}) => {
      const tabMode = options.tab ?? "new";
      const previousActivePath = useAppStore.getState().activeFilePath;
      // Flush sync de qualquer trabalho pendente do Editor antes de trocar
      // de arquivo. Sem isso, o turndown debounced (180ms) rodaria depois
      // do setActiveFile e o setFileBody do antigo gravaria por cima do
      // body do novo. Tem que rodar ANTES da mudanca da store pq depende
      // de prev.fileBody no subscribe do useAutoSave.
      flushEditor();

      // Saindo de um buffer untitled → guarda o conteudo em memória pra não
      // perder ao voltar (só um buffer fica em fileBody por vez).
      const prev = useAppStore.getState();
      if (isUntitledPath(previousActivePath) && previousActivePath) {
        prev.stashUntitled(previousActivePath, prev.fileBody, prev.sceneMeta);
      }
      // Alvo é um buffer untitled → restaura da memória (não le do disco).
      if (isUntitledPath(path)) {
        const buf = useAppStore.getState().untitledBuffers[path];
        setActiveFile(path, name, buf?.body ?? "", buf?.meta ?? {});
        if (tabMode === "replace") {
          useAppStore.getState().replaceActiveTab(path, name, previousActivePath);
        } else if (tabMode === "new") {
          useAppStore.getState().addTab(path, name);
        }
        return; // untitled não entra em recents nem le disco
      }

      if (isTauriRuntime()) {
        try {
          assertProjectNotePath(useAppStore.getState().rootFolder, path);
          const { readTextFile } = await import("@tauri-apps/plugin-fs");
          const content = await readTextFile(path);
          const { meta, body } = parseDocument(content);
          setActiveFile(path, name, body, meta);
          if (tabMode === "replace") {
            useAppStore.getState().replaceActiveTab(path, name, previousActivePath);
          } else if (tabMode === "new") {
            useAppStore.getState().addTab(path, name);
          }
          useAppStore.getState().pushRecentFile(path, name);
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
          "/mock/romance/parte1/cap01.md": `# Capitulo 1
`,
          "/mock/romance/personagens.md": `# Notas de Personagens
`,
          "/mock/romance/world.md": `# Worldbuilding
`,
        };

        const content =
          mockContent[path] ||
          `# ${name.replace(".md", "")}\n`;
        const { meta, body } = parseDocument(content);
        setActiveFile(path, name, body, meta);
        if (tabMode === "replace") {
          useAppStore.getState().replaceActiveTab(path, name, previousActivePath);
        } else if (tabMode === "new") {
          useAppStore.getState().addTab(path, name);
        }
        useAppStore.getState().pushRecentFile(path, name);
      }
    },
    [setActiveFile]
  );

  const saveFile = useCallback(
    async (path: string, content: string) => {
      if (!isTauriRuntime()) return;
      try {
        const { rootFolder, localHistoryEnabled } = useAppStore.getState();
        assertProjectNotePath(rootFolder, path);
        if (localHistoryEnabled) {
          await createSnapshotBeforeWrite({
            rootFolder,
            filePath: path,
            nextContent: content,
          });
        }
        // Escrita atomica: lib/atomicWrite escreve em
        // `<path>.<rand>.solon-tmp` e renomeia por cima. Crash durante
        // a escrita NUNCA deixa o arquivo destino truncado.
        const ok = await atomicWriteTextFile(path, content);
        if (!ok) {
          throw new Error("falha ao gravar (FS readonly ou bloqueio)");
        }
        // Apos save bem-sucedido, limpa o draft de crash recovery (se
        // houver). O ciclo de "draft → save" fecha aqui.
        try {
          const { clearRecoveryDraft } = await import("../lib/crashRecovery");
          await clearRecoveryDraft(rootFolder, path);
        } catch {
          /* recovery é best-effort — falhas silenciosas */
        }
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
        throw err;
      }
    },
    []
  );

  /**
   * Troca a pasta do projeto. Antes de trocar, grava a edição pendente da
   * nota aberta — o salvamento exige que a nota esteja dentro da raiz, e
   * depois da troca ela não está mais (a edição falhava ao salvar). Se a
   * gravação falhar, não troca: melhor ficar no projeto do que perder
   * texto.
   */
  const switchProject = useCallback(
    async (newRoot: string): Promise<boolean> => {
      flushEditor();
      const before = useAppStore.getState();
      const pending =
        before.activeFilePath &&
        !isUntitledPath(before.activeFilePath) &&
        before.saveStatus !== "saved" &&
        before.saveStatus !== "idle";
      if (pending && before.activeFilePath) {
        try {
          await saveFile(
            before.activeFilePath,
            serializeDocument(before.sceneMeta, before.fileBody),
          );
          useAppStore.getState().setSaveStatus("saved");
        } catch {
          return false;
        }
      }

      // Fecha o que não pertence ao projeto novo ANTES de trocar a raiz: o
      // editor recarrega a nota quando a raiz muda, e recarregar a nota
      // antiga sob a raiz nova a marcava como editada — o auto-save então
      // tentava gravá-la fora do projeto e mostrava erro.
      for (const tab of useAppStore.getState().openTabs) {
        if (!isUntitledPath(tab.path) && !isProjectNotePath(newRoot, tab.path)) {
          useAppStore.getState().closeTab(tab.path);
        }
      }
      const active = useAppStore.getState().activeFilePath;
      if (active && !isUntitledPath(active) && !isProjectNotePath(newRoot, active)) {
        useAppStore.setState({
          activeFilePath: null,
          activeFileName: null,
          fileBody: "",
          sceneMeta: {},
          headings: [],
          wordCount: 0,
          charCount: 0,
          saveStatus: "idle",
        });
      }

      // Troca de projeto: invalida o cache de URLs de imagem (blob:)
      // do projeto anterior. Sem isso, blob URLs apontando pra
      // arquivos de outro projeto vazam memória até o app fechar
      // E (pior) podem colidir se dois projetos tiverem nomes de
      // asset iguais.
      clearImageUrlCache();
      setRootFolder(newRoot);
      // Lido antes de qualquer await: a partir daqui a raiz já é a
      // nova, e a árvore na tela ainda é a do projeto anterior.
      const expanded = rememberedExpandedFolders(newRoot);
      // Carrega a ordem manual ANTES do tree pra que o primeiro
      // setFileTree já venha ordenado. Sem isso, user veria o
      // sort alfabetico por 1 frame.
      const order = await loadOrder(newRoot);
      setSidebarOrder(order);
      const tree = await buildFileTree(newRoot, expanded);
      setFileTree(applyOrder(newRoot, tree, order));
      return true;
    },
    [saveFile, setRootFolder, setSidebarOrder, setFileTree],
  );

  const openFolder = useCallback(async () => {
    if (isTauriRuntime()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false });
        if (selected && typeof selected === "string") {
          await switchProject(selected);
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
  }, [setRootFolder, setFileTree, switchProject]);

  /**
   * Abre um .md/.txt avulso — pelo diálogo ou pelo caminho que o sistema
   * passou ("Abrir com", duplo clique). Como no Typora, a pasta do arquivo
   * vira a pasta aberta na lateral: histórico local, recuperação de crash,
   * imagens e wikilinks dependem de uma raiz e continuam valendo. Se o
   * arquivo já está no projeto aberto, só abre.
   */
  const openFileFromDisk = useCallback(
    async (path?: string) => {
      if (!isTauriRuntime()) return;
      try {
        let target = path;
        if (!target) {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const selected = await open({
            directory: false,
            multiple: false,
            filters: [{ name: "Notas", extensions: ["md", "txt"] }],
          });
          if (!selected || typeof selected !== "string") return;
          target = selected;
        }
        if (!NOTE_FILE_RE.test(target)) {
          useAppStore
            .getState()
            .pushToast("error", "O Solon abre notas .md e .txt.");
          return;
        }
        const currentRoot = useAppStore.getState().rootFolder;
        if (!isProjectNotePath(currentRoot, target)) {
          const switched = await switchProject(parentOf(target));
          if (!switched) return;
        }
        await openFile(target, baseName(target), { tab: "new" });
        useAppStore.getState().setActiveView("editor");
      } catch (err) {
        console.error("Erro ao abrir arquivo:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao abrir arquivo: ${describeError(err)}`);
      }
    },
    [switchProject, openFile],
  );

  const refresh = useCallback(async () => {
    if (!isTauriRuntime() || !rootFolder) return;
    const currentTree = useAppStore.getState().fileTree;
    const expanded = new Set<string>();
    collectExpandedPaths(currentTree, expanded);
    const tree = await buildFileTree(rootFolder, expanded);
    // Aplica a ordem manual (drag-and-drop) por cima do tree default.
    // Items NAO listados na ordem ficam ao fim em ordem alfabetica.
    const order = useAppStore.getState().sidebarOrder;
    setFileTree(applyOrder(rootFolder, tree, order));
  }, [rootFolder, setFileTree]);

  const restoreLastFolder = useCallback(async () => {
    if (!isTauriRuntime()) return;
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
      const expanded = rememberedExpandedFolders(last);
      // Carrega a ordem manual antes do tree pra que apareca ja
      // ordenado no boot.
      const order = await loadOrder(last);
      setSidebarOrder(order);
      const tree = await buildFileTree(last, expanded);
      setFileTree(applyOrder(last, tree, order));

      // Restaura também o último arquivo aberto. Importante: NAO mudamos
      // activeView aqui — a HomePage continua sendo o landing inicial,
      // mas com `activeFilePath` ja settado o botao "Continuar" tem alvo.
      // Silent: erro de leitura limpa a chave pra evitar pop-up vermelho
      // toda vez que o app abre após um arquivo ter sido movido/apagado.
      const { openLastFileOnStartup } = useAppStore.getState();
      const lastFile = openLastFileOnStartup
        ? localStorage.getItem("solon:lastFile")
        : null;
      if (lastFile) {
        try {
          if (isProjectNotePath(last, lastFile) && await exists(lastFile)) {
            const content = await readTextFile(lastFile);
            const { meta, body } = parseDocument(content);
            const name = lastFile.split(/[\\/]/).pop() ?? lastFile;
            useAppStore.getState().setActiveFile(lastFile, name, body, meta);
            useAppStore.getState().addTab(lastFile, name);
          } else {
            localStorage.removeItem("solon:lastFile");
          }
        } catch {
          localStorage.removeItem("solon:lastFile");
        }
      }
      // Sanitiza abas restauradas do localStorage: arquivos que sumiram
      // do disco entre sessoes não devem entupir a barra. Em paralelo
      // pra não serializar 10 stat() calls.
      const tabs = useAppStore.getState().openTabs;
      if (tabs.length > 0) {
        const checks = await Promise.all(
          tabs.map(async (t) => ({
            tab: t,
            exists: isProjectNotePath(last, t.path) && await exists(t.path),
          })),
        );
        for (const { tab, exists: ok } of checks) {
          if (!ok) useAppStore.getState().closeTab(tab.path);
        }
      }

      const splitPane = useAppStore.getState().splitPane;
      if (
        splitPane.kind === "reference" &&
        (!isProjectNotePath(last, splitPane.path) || !(await exists(splitPane.path)))
      ) {
        useAppStore.getState().closeSplitPane();
      }

      // Crash recovery: varre .solon/.recovery em busca de drafts cujo
      // conteudo diverge do que esta no disco. Se houver, abre o dialog
      // perguntando se o user quer recuperar. Roda após restore do
      // arquivo ativo pra que o dialog apareca por cima do estado
      // estável da app.
      void scanRecoveryDrafts(last)
        .then((drafts) => {
          if (drafts.length > 0) {
            useAppStore.getState().setPendingRecoveryDrafts(drafts);
          }
        })
        .catch(() => {
          /* recovery é best-effort */
        });
    } catch (err) {
      console.error("Erro ao restaurar pasta:", err);
    }
  }, [setRootFolder, setFileTree, setSidebarOrder]);

  const createFile = useCallback(
    async (parentDir: string, name: string) => {
      if (!isTauriRuntime()) return;
      const finalName = name.endsWith(".md") || name.endsWith(".txt") ? name : `${name}.md`;
      const full = joinPath(parentDir, finalName);
      try {
        assertInsideProject(rootFolder, parentDir, "Pasta");
        if (rejectUnsafeName(finalName, "file")) return;
        const { exists } = await import("@tauri-apps/plugin-fs");
        if (await exists(full)) {
          useAppStore
            .getState()
            .pushToast("error", "Já existe um arquivo com esse nome.");
          return;
        }
        // Arquivo nasce em branco — sem heading auto-injetado. O editor
        // cuida da experiência inicial via Placeholder ("Comece a escrever…"),
        // o que e mais respeitoso pra ficcao: nem sempre a primeira linha
        // e um título de capitulo (cena curta, fragmento, nota).
        // Conteudo vazio mas usamos atomic write por consistencia —
        // garante que o arquivo aparece no FS apenas quando completo
        // (zero risco de stub corrompido em crash).
        await atomicWriteTextFile(full, "");
        // Garante que a pasta destino fica EXPANDIDA após refresh — sem
        // isso, criar dentro de pasta fechada deixa o user sem ver o
        // novo arquivo. Adicionamos o parentDir ao expanded set ANTES
        // do refresh consumir.
        if (parentDir !== rootFolder) {
          useAppStore.setState((s) => ({
            fileTree: forceExpandPath(s.fileTree, parentDir),
          }));
        }
        await refresh();
        await openFile(full, finalName, { tab: "replace" });
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
    [refresh, openFile, rootFolder]
  );

  /**
   * Duplica um arquivo `.md`/`.txt`. Nome do novo: `<base> (copia).<ext>`
   * com sufixo numerico em colisão. Mesmo diretorio do original. Abre na
   * aba ativa após copiar — convencao "Duplicate" do macOS Finder.
   *
   * NAO copia o sidecar de canvas (`.canvas.json`) — duplicar canvases
   * confundiria scene cards que apontam pra arquivo único. Quem
   * precisar do canvas também, copia manualmente via FS.
   */
  const duplicateFile = useCallback(
    async (sourcePath: string) => {
      if (!isTauriRuntime()) return;
      try {
        assertProjectNotePath(rootFolder, sourcePath, "Arquivo de origem");
        const { readTextFile, exists } = await import(
          "@tauri-apps/plugin-fs"
        );
        if (!(await exists(sourcePath))) {
          useAppStore
            .getState()
            .pushToast("error", "Arquivo de origem não existe mais.");
          return;
        }
        const content = await readTextFile(sourcePath);
        const parent = parentOf(sourcePath);
        const sourceName = baseName(sourcePath);
        const m = sourceName.match(/^(.*?)(\.(md|txt))?$/i);
        const base = m?.[1] ?? sourceName;
        const ext = m?.[2] ?? ".md";
        // Procura nome livre: "base (copia).ext" → "base (copia 2).ext" ...
        let candidate = `${base} (cópia)${ext}`;
        let n = 2;
        while (await exists(joinPath(parent, candidate))) {
          candidate = `${base} (cópia ${n})${ext}`;
          n += 1;
          if (n > 999) break;
        }
        const newPath = joinPath(parent, candidate);
        // Atomic write: pra arquivos grandes (capitulo de livro), crash
        // durante a copia deixaria o destino truncado — perda real.
        const ok = await atomicWriteTextFile(newPath, content);
        if (!ok) throw new Error("falha ao gravar a cópia");
        await refresh();
        await openFile(newPath, candidate, { tab: "replace" });
      } catch (err) {
        console.error("Erro ao duplicar arquivo:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao duplicar: ${describeError(err)}`);
      }
    },
    [refresh, openFile, rootFolder],
  );

  const createFolder = useCallback(
    async (parentDir: string, name: string) => {
      if (!isTauriRuntime()) return;
      const full = joinPath(parentDir, name);
      try {
        assertInsideProject(rootFolder, parentDir, "Pasta");
        if (rejectUnsafeName(name, "folder")) return;
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
    [refresh, rootFolder]
  );

  const renameNode = useCallback(
    async (oldPath: string, newName: string) => {
      if (!isTauriRuntime()) return;
      const parent = parentOf(oldPath);
      const newPath = joinPath(parent, newName);
      if (newPath === oldPath) return;
      const nodeType = findNodeType(useAppStore.getState().fileTree, oldPath);
      const isFolder = nodeType === "folder";
      if (rejectUnsafeName(newName, isFolder ? "folder" : "file")) return;
      const activeRelBefore = activeFilePath
        ? relativeInside(activeFilePath, oldPath)
        : null;
      try {
        const { rename, exists } = await import("@tauri-apps/plugin-fs");
        assertInsideProject(rootFolder, oldPath, "Origem");
        assertInsideProject(rootFolder, newPath, "Destino");
        if (!isFolder) assertProjectNotePath(rootFolder, newPath, "Arquivo");
        // Em FS case-insensitive (Windows/macOS default), exists(newPath)
        // retorna true pro PROPRIO arquivo quando só a caixa muda ("um
        // nota" → "Um Nota"). Sem esse guard o rename de caixa era barrado
        // com "Ja' existe um item com esse nome". rename() direto de caixa
        // funciona nessas plataformas — o guard só evita o falso conflito.
        const isCaseOnlyRename =
          normalizedPath(oldPath).toLowerCase() ===
          normalizedPath(newPath).toLowerCase();
        if (!isCaseOnlyRename && (await exists(newPath))) {
          useAppStore
            .getState()
            .pushToast("error", "Já existe um item com esse nome.");
          return;
        }
        const activeSnapshot =
          activeRelBefore !== null && activeFilePath
            ? {
                rel: activeRelBefore,
                body: useAppStore.getState().fileBody,
                meta: useAppStore.getState().sceneMeta,
              }
            : null;
        if (activeSnapshot && activeFilePath) {
          await saveFile(
            activeFilePath,
            serializeDocument(activeSnapshot.meta, activeSnapshot.body),
          );
          useAppStore.getState().setSaveStatus("saved");
        }
        await rename(oldPath, newPath);
        // Sidecar canvas segue junto com o arquivo
        if (!isFolder) await renameCanvasSidecar(oldPath, newPath);
        // Reaponta scene cards de outros canvases para o novo caminho
        if (isFolder) {
          useCanvasStore.getState().rewireScenePathPrefix(oldPath, newPath);
        } else {
          useCanvasStore.getState().rewireScenePath(oldPath, newPath);
        }
        // Atualiza abas abertas: arquivo renomeado vai pra renameTab;
        // pasta renomeada usa rebaseTabs (todos os filhos abertos).
        if (isFolder) {
          useAppStore.getState().rebaseTabs(oldPath, newPath);
        } else {
          useAppStore.getState().renameTab(oldPath, newPath, baseName(newPath));
        }
        // Atualiza a ordem manual: troca oldName por newName em qualquer
        // pasta que listava o item. Sem isso, depois do rename o item
        // sumiria do "ordenado" e iria pro fim da pasta como "novo".
        const oldName = baseName(oldPath);
        if (rootFolder) {
          const currentOrder = useAppStore.getState().sidebarOrder;
          const parentKey = relPath(rootFolder, parent);
          let updated = renameInOrder(currentOrder, oldName, newName, parentKey);
          if (isFolder) {
            updated = renameFolderInOrder(
              updated,
              relPath(rootFolder, oldPath),
              relPath(rootFolder, newPath),
            );
          }
          if (updated !== currentOrder) {
            setSidebarOrder(updated);
            saveOrder(rootFolder, updated);
          }
        }
        await refresh();
        // Se renomeou o arquivo aberto ou uma pasta que o contem, reabre
        // preservando o buffer em memória que acabamos de salvar.
        if (activeSnapshot) {
          const nextActivePath = joinRelative(newPath, activeSnapshot.rel);
          setActiveFile(
            nextActivePath,
            baseName(nextActivePath),
            activeSnapshot.body,
            activeSnapshot.meta,
          );
          useAppStore.getState().setSaveStatus("saved");
        }
      } catch (err) {
        console.error("Erro ao renomear:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao renomear: ${describeError(err)}`);
      }
    },
    [refresh, activeFilePath, setActiveFile, saveFile, rootFolder, setSidebarOrder]
  );

  const deleteNode = useCallback(
    async (path: string, isFolder: boolean) => {
      if (!isTauriRuntime()) return;
      try {
        assertInsideProject(rootFolder, path, "Item");
        if (normalizedPath(path) === normalizedPath(rootFolder ?? "")) {
          throw new Error("A pasta raiz do projeto não pode ser excluída pelo Solon.");
        }
        const { remove } = await import("@tauri-apps/plugin-fs");
        await remove(path, isFolder ? { recursive: true } : undefined);
        if (!isFolder) await deleteCanvasSidecar(path);
        // Remove da ordem manual em qualquer pasta. Senao a entry no
        // .solon/order.json fica orfa apontando pra um nome que não
        // existe mais.
        const removedName = baseName(path);
        if (rootFolder) {
          const currentOrder = useAppStore.getState().sidebarOrder;
          const parentKey = relPath(rootFolder, parentOf(path));
          let updated = removeFromOrder(currentOrder, removedName, parentKey);
          if (isFolder) {
            updated = removeFolderFromOrder(updated, relPath(rootFolder, path));
          }
          if (updated !== currentOrder) {
            setSidebarOrder(updated);
            saveOrder(rootFolder, updated);
          }
        }
        await refresh();
        // Tira da lista de abas qualquer arquivo dentro do que foi
        // removido. Em delete de pasta, isso pode ser varios paths de uma
        // vez — iteramos a lista atual.
        const tabsBefore = useAppStore.getState().openTabs;
        for (const t of tabsBefore) {
          if (isSameOrDescendant(t.path, path)) {
            useAppStore.getState().closeTab(t.path);
          }
        }
        // Mesmo tratamento pra recents — entries orfas confundem a Home.
        const recentsBefore = useAppStore.getState().recentFiles;
        for (const r of recentsBefore) {
          if (isSameOrDescendant(r.path, path)) {
            useAppStore.getState().removeRecentFile(r.path);
          }
        }
        if (activeFilePath && isSameOrDescendant(activeFilePath, path)) {
          // Limpa arquivo ativo se foi removido. Se ainda ha abas, ativa
          // a primeira disponível.
          const remaining = useAppStore.getState().openTabs[0];
          if (remaining) {
            await openFile(remaining.path, remaining.name, { tab: "preserve" });
          } else {
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
        }
      } catch (err) {
        console.error("Erro ao excluir:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao excluir: ${describeError(err)}`);
      }
    },
    [refresh, activeFilePath, openFile, rootFolder, setSidebarOrder]
  );

  /**
   * Reordena um item dentro da mesma pasta. `draggedPath` deve ficar
   * antes de `targetPath`. Se `targetPath` é null, vai pro FIM da
   * pasta. Apenas reorder dentro da MESMA pasta — mover entre pastas
   * envolveria rename no filesystem (out-of-scope agora).
   *
   * `siblingNamesUI` é a lista atual de nomes naquela pasta na ordem
   * que o user esta vendo. Usado pra inicializar a entry do JSON
   * caso a pasta ainda não tinha custom order.
   */
  const reorderItem = useCallback(
    async (
      draggedPath: string,
      targetPath: string | null,
      siblingNamesUI: string[],
    ) => {
      if (!rootFolder) return;
      const draggedName =
        draggedPath.split(/[\\/]/).pop() ?? draggedPath;
      const targetName = targetPath
        ? (targetPath.split(/[\\/]/).pop() ?? null)
        : null;
      const parentPath = parentOf(draggedPath);
      const folderKey = relPath(rootFolder, parentPath);

      const currentOrder = useAppStore.getState().sidebarOrder;
      const updated = reorderInFolder(
        currentOrder,
        folderKey,
        draggedName,
        targetName,
        siblingNamesUI,
      );
      setSidebarOrder(updated);
      // Re-aplica imediatamente no fileTree atual (sem rebuilda do
      // disco). Re-render UI fica instantaneo.
      const tree = useAppStore.getState().fileTree;
      setFileTree(applyOrder(rootFolder, tree, updated));
      // Persiste async (não bloqueia a UI).
      saveOrder(rootFolder, updated);
    },
    [rootFolder, setSidebarOrder, setFileTree],
  );

  /**
   * Move um item (arquivo ou pasta) pra dentro de outra pasta. Faz
   * fs.rename real no disco — diferente de `reorderItem` que só mexe
   * no JSON da ordem.
   *
   * Validacoes:
   *  - Pasta destino deve existir
   *  - Nao pode mover pasta pra dentro de si mesma ou de uma filha
   *  - Conflito de nomes: aborta com toast (não sobrescreve)
   *
   * Side effects:
   *  - Renomeia sidecar de canvas
   *  - Reaponta scene cards
   *  - Remove do sidebarOrder antigo, deixa na ordem default da nova pasta
   *  - Reload do activeFile se foi o item movido
   */
  const moveItem = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      if (!isTauriRuntime() || !rootFolder) {
        return;
      }
      // Guards de sanidade
      if (normalizedPath(sourcePath) === normalizedPath(targetFolderPath)) {
        return;
      }
      const parentOfSource = parentOf(sourcePath);
      const sourceType = findNodeType(useAppStore.getState().fileTree, sourcePath);
      if (!sourceType) return;
      const sourceIsFolder = sourceType === "folder";
      if (normalizedPath(parentOfSource) === normalizedPath(targetFolderPath)) {
        return;
      }
      // Nao mover pasta pra dentro de si mesma ou descendente
      if (sourceIsFolder && isSameOrDescendant(targetFolderPath, sourcePath)) {
        useAppStore
          .getState()
          .pushToast("error", "Não é possível mover uma pasta para dentro dela mesma.");
        return;
      }

      // Sem `rejectUnsafeName` aqui: mover não cria nome novo, e o filtro
      // de nome (feito pra quem digita um) barrava itens que o disco já
      // aceitou — espaço no começo, `?` ou `:` no macOS/Linux. Esses
      // itens apareciam na árvore e simplesmente não saíam do lugar.
      const name = baseName(sourcePath);
      const newPath = joinPath(targetFolderPath, name);
      const activeRelBefore = activeFilePath
        ? relativeInside(activeFilePath, sourcePath)
        : null;

      try {
        assertInsideProject(rootFolder, sourcePath, "Origem");
        assertInsideProject(rootFolder, targetFolderPath, "Destino");
        assertInsideProject(rootFolder, newPath, "Destino");
        if (!sourceIsFolder) assertProjectNotePath(rootFolder, sourcePath, "Arquivo");
        const { rename, exists } = await import(
          "@tauri-apps/plugin-fs"
        );
        if (await exists(newPath)) {
          useAppStore
            .getState()
            .pushToast("error", `Já existe um item "${name}" na pasta destino.`);
          return;
        }
        const activeSnapshot =
          activeRelBefore !== null && activeFilePath
            ? {
                rel: activeRelBefore,
                body: useAppStore.getState().fileBody,
                meta: useAppStore.getState().sceneMeta,
              }
            : null;
        if (activeSnapshot && activeFilePath) {
          await saveFile(
            activeFilePath,
            serializeDocument(activeSnapshot.meta, activeSnapshot.body),
          );
          useAppStore.getState().setSaveStatus("saved");
        }
        await rename(sourcePath, newPath);
        // Sidecar do canvas + scene cards seguem o arquivo
        if (sourceIsFolder) {
          useCanvasStore.getState().rewireScenePathPrefix(sourcePath, newPath);
        } else {
          await renameCanvasSidecar(sourcePath, newPath);
          useCanvasStore.getState().rewireScenePath(sourcePath, newPath);
        }
        // Abas: arquivo movido = rename de path (nome mantem); pasta
        // movida = rebase de todos os filhos abertos.
        if (sourceIsFolder) {
          useAppStore.getState().rebaseTabs(sourcePath, newPath);
        } else {
          useAppStore.getState().renameTab(sourcePath, newPath, name);
        }
        // Remove do sidebarOrder do parent ANTIGO (não chamamos
        // renameInOrder porque o nome não mudou — só a pasta).
        const currentOrder = useAppStore.getState().sidebarOrder;
        const sourceParentKey = relPath(rootFolder, parentOfSource);
        let updated = removeFromOrder(currentOrder, name, sourceParentKey);
        if (sourceIsFolder) {
          updated = renameFolderInOrder(
            updated,
            relPath(rootFolder, sourcePath),
            relPath(rootFolder, newPath),
          );
        }
        if (updated !== currentOrder) {
          setSidebarOrder(updated);
          saveOrder(rootFolder, updated);
        }
        if (useAppStore.getState().autoExpandMovedFolders) {
          useAppStore.setState((s) => ({
            fileTree: forceExpandPath(s.fileTree, targetFolderPath),
          }));
        }
        await refresh();
        // Re-aponta activeFile se foi o item movido ou estava dentro dele.
        if (activeSnapshot) {
          const nextActivePath = joinRelative(newPath, activeSnapshot.rel);
          setActiveFile(
            nextActivePath,
            baseName(nextActivePath),
            activeSnapshot.body,
            activeSnapshot.meta,
          );
          useAppStore.getState().setSaveStatus("saved");
        }
      } catch (err) {
        console.error("Erro ao mover item:", err);
        useAppStore
          .getState()
          .pushToast("error", `Erro ao mover: ${describeError(err)}`);
      }
    },
    [refresh, rootFolder, activeFilePath, setActiveFile, setSidebarOrder, saveFile],
  );

  /**
   * Cria um arquivo "Sem título.md" (com sufixo numerico em colisão) na
   * raiz do projeto e abre na aba ativa. Usado pelo atalho Ctrl+T.
   *
   * Decisao: cria de fato no disco em vez de buffer untitled em memória.
   * Buffers untitled exigiriam infraestrutura nova (estado não-persistido,
   * dialogo de "salvar onde?" no fechamento) sem ganho real pra escrita
   * — um arquivo .md em branco eh barato e funciona como ponto de partida.
   */
  const createUntitled = useCallback(async () => {
    if (!rootFolder) {
      useAppStore
        .getState()
        .pushToast("info", "Abra uma pasta antes de criar uma nota.");
      return;
    }
    if (!isTauriRuntime()) return;
    try {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const base = "Sem título";
      let name = `${base}.md`;
      let n = 1;
      while (await exists(joinPath(rootFolder, name))) {
        n += 1;
        name = `${base} ${n}.md`;
        if (n > 999) break; // sanity guard — quase impossível mas evita loop
      }
      const full = joinPath(rootFolder, name);
      assertProjectNotePath(rootFolder, full);
      await atomicWriteTextFile(full, "");
      await refresh();
      await openFile(full, name);
    } catch (err) {
      console.error("Erro ao criar nota sem titulo:", err);
      useAppStore
        .getState()
        .pushToast("error", `Erro ao criar nota: ${describeError(err)}`);
    }
  }, [rootFolder, refresh, openFile]);

  /**
   * Materializa um buffer untitled (Ctrl+T) num arquivo real. Grava o
   * conteudo ATUAL (que esta em fileBody, ativo) com o nome dado, troca a aba
   * untitled -> arquivo real e descarta o buffer da memória. Usado no Ctrl+S
   * quando a aba ativa é untitled. Retorna `true` se salvou.
   */
  const materializeUntitled = useCallback(
    async (untitledPath: string, rawName: string): Promise<boolean> => {
      if (!isTauriRuntime()) return false;
      if (!rootFolder) {
        useAppStore
          .getState()
          .pushToast("info", "Abra uma pasta antes de salvar a nota.");
        return false;
      }
      const finalName =
        rawName.endsWith(".md") || rawName.endsWith(".txt")
          ? rawName
          : `${rawName}.md`;
      if (rejectUnsafeName(finalName, "file")) return false;
      const full = joinPath(rootFolder, finalName);
      try {
        assertProjectNotePath(rootFolder, full, "Arquivo");
        const { exists } = await import("@tauri-apps/plugin-fs");
        if (await exists(full)) {
          useAppStore
            .getState()
            .pushToast("error", "Já existe um arquivo com esse nome.");
          return false;
        }
        // Garante que o último trabalho do editor esta em fileBody.
        flushEditor();
        const s = useAppStore.getState();
        const content = serializeDocument(s.sceneMeta, s.fileBody);
        const ok = await atomicWriteTextFile(full, content);
        if (!ok) throw new Error("falha ao gravar (FS readonly ou bloqueio)");
        await refresh();
        // Troca a aba untitled -> arquivo real, aponta o ativo e limpa o buffer.
        useAppStore.getState().renameTab(untitledPath, full, finalName);
        setActiveFile(full, finalName, s.fileBody, s.sceneMeta);
        useAppStore.getState().dropUntitled(untitledPath);
        useAppStore.getState().pushRecentFile(full, finalName);
        useAppStore.getState().setSaveStatus("saved");
        return true;
      } catch (err) {
        useAppStore
          .getState()
          .pushToast("error", `Erro ao salvar: ${describeError(err)}`);
        return false;
      }
    },
    [refresh, rootFolder, setActiveFile],
  );

  return {
    openFolder,
    openFileFromDisk,
    openFile,
    saveFile,
    refresh,
    restoreLastFolder,
    createFile,
    createUntitled,
    materializeUntitled,
    duplicateFile,
    createFolder,
    renameNode,
    deleteNode,
    reorderItem,
    moveItem,
  };
}

/**
 * Pastas que estavam abertas da última vez neste projeto. Segue o ajuste
 * "Restaurar sessão": quem desligou quer a árvore recolhida ao abrir.
 */
function rememberedExpandedFolders(rootFolder: string): Set<string> | undefined {
  if (!useAppStore.getState().restoreWorkspaceLayout) return undefined;
  return loadExpandedFolders(rootFolder);
}

/**
 * Coleta recursivamente os paths de TODAS as pastas expandidas no tree
 * atual. Usado pra preservar o estado de expansao quando rebuilda — sem
 * isso, criar/deletar/renomear arquivo colapsava todas as pastas (UX
 * frustrante: user abria pasta, criava nota, pasta sumia).
 */
function collectExpandedPaths(nodes: FileNode[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.type === "folder" && n.expanded) out.add(n.path);
    if (n.children) collectExpandedPaths(n.children, out);
  }
}

/**
 * Marca uma pasta especifica como expandida (e todos os ancestrais até
 * a raiz). Util quando criamos um arquivo dentro de pasta colapsada e
 * queremos garantir que o user veja o novo item sem ter que clicar pra
 * abrir.
 */
function forceExpandPath(nodes: FileNode[], targetPath: string): FileNode[] {
  return nodes.map((n) => {
    if (n.type !== "folder") return n;
    // Se o target é descendente desta pasta, expande ela e recursa.
    const isAncestor =
      targetPath === n.path || targetPath.startsWith(n.path + "/") ||
      targetPath.startsWith(n.path + "\\");
    if (!isAncestor) return n;
    return {
      ...n,
      expanded: true,
      children: n.children ? forceExpandPath(n.children, targetPath) : n.children,
    };
  });
}

async function buildFileTree(
  dirPath: string,
  preserveExpanded?: Set<string>,
  depth = 0,
): Promise<FileNode[]> {
  if (!isTauriRuntime() || depth > MAX_TREE_DEPTH) return [];
  try {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const entries = await readDir(dirPath);
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const entryName = entry.name || "";
      if (entryName.startsWith(".") || IGNORED_TREE_DIRS.has(entryName)) continue;
      const fullPath = joinPath(dirPath, entryName);
      if ("isDirectory" in entry ? entry.isDirectory : (entry as any).children !== undefined) {
        const children = await buildFileTree(fullPath, preserveExpanded, depth + 1);
        nodes.push({
          name: entryName,
          path: fullPath,
          type: "folder",
          // Preserva estado de expansao do tree anterior. Default false
          // pra pastas novas (que ainda não existiam no tree antigo).
          expanded: preserveExpanded?.has(fullPath) ?? false,
          children,
        });
      } else if (NOTE_FILE_RE.test(entryName)) {
        nodes.push({ name: entryName, path: fullPath, type: "file" });
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
