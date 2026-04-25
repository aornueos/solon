# Changelog — Solon

Editor de escrita criativa em Tauri 2 + React + TipTap.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [0.5.0] — 2026-04-18 — Canvas por-arquivo, tema escuro neutro e tabelas

Reescrita estrutural com três eixos: (1) o canvas deixa de ser global do
projeto e passa a ser *por arquivo*; (2) novo tema escuro baseado em
grafite neutro, trocável a quente; (3) suporte a tabelas estilo Obsidian
no editor. Bugs crônicos de lista e separador de cena corrigidos.

### Adicionado
- **Canvas por arquivo** — cada `.md` tem seu próprio canvas, gravado
  como sidecar `<arquivo>.canvas.json` ao lado do original. Rename/delete
  do `.md` via app movimenta/remove o sidecar automaticamente. O canvas
  global antigo (`.solon/canvas.json`) deixa de ser usado; projetos
  existentes começam com canvas vazio e podem copiar cards manualmente.
- **Tema escuro neutro** (grafite, não sépia) — paleta focada em
  `#1b1c1e → #3e4046` com warmth quase imperceptível; âmbar permanece
  como *accent* editorial. Toggle por botão na titlebar ou `Ctrl+Shift+L`;
  preferência persistida em `localStorage`. Aplicado via atributo
  `data-theme` em `<html>`, variáveis CSS em `:root` / `[data-theme=dark]`.
- **Tabelas no editor** via `@tiptap/extension-table` + `-row` / `-cell` /
  `-header`. Menu dedicado no toolbar: inserir 3×3, adicionar/remover
  linhas e colunas, excluir tabela. Estilo Obsidian — grade sutil, header
  em bg-panel-2, linhas zebra, resize de coluna com handle âmbar. Tabelas
  fazem roundtrip com Markdown via `turndown-plugin-gfm`.
- **Ferramenta Seta (`A`)** no canvas — modo dedicado para criar arrows
  entre cards em 2 cliques (origem → destino). Antes era só via o botão
  inline "Conectar" no card hover.
- **Marquee selection** no canvas — arraste no espaço vazio (modo
  select) para desenhar um retângulo e selecionar múltiplos cards/
  textos/imagens. Delete remove todos de uma vez. Cards em seleção de
  grupo têm ring âmbar sutil.
- **DOMPurify** na ponte Markdown → HTML: tags permitidas allowlistadas
  (p, headings, ul/ol/li, table stack, strong/em/s, code, hr, blockquote),
  atributos perigosos (`style`, `on*`, `src`, `href`, `srcdoc`) bloqueados.
  Protege contra XSS em documentos vindos de fora (clipboard, arquivos
  compartilhados, gerações externas).

### Corrigido
- **Bullets e listas numeradas** não renderizavam porque o preflight do
  Tailwind reseta `list-style: none`. Restaurado com
  `list-style: disc outside` / `decimal outside` + padding adequado na
  `.ProseMirror`.
- **Separador de cena (`---`)** não aparecia — `::after` em `<hr>` é
  ressalvado por Chrome (elemento replaced). Substituído por
  `background: linear-gradient(...)` com `currentColor`, render
  previsível e theme-aware.
- **"Fit all"** no canvas agora inclui imagens e textos flutuantes
  (antes só considerava cards) e usa o retângulo real do container, não
  `window.innerWidth - 280` chumbado para a largura do sidebar.
- **Toolbar do editor** reescrita em padrão table-driven (`ToolSpec[]`
  + `<ToolGroup>`) eliminando a cascata de `if`s repetidos em cada botão.

### Refatorado
- `useCanvasStore`: `rootFolder` → `filePath`. Novas actions
  `selectMany`, `toggleInSelection`; `selectedIds: Set<string>` coexiste
  com `selectedId` (primária).
- `useCanvasPersistence`: hidrata por `activeFilePath`; flush do arquivo
  anterior antes de carregar o novo garante que nada vaza entre docs.
- CSS de componentes migrado para variáveis CSS (`var(--bg-panel)`,
  `var(--text-muted)`, etc.) — light/dark trocam sem re-render React.

### Notas
- O sidecar `<file>.canvas.json` é visível pelo filesystem mas não
  aparece no Explorer do Solon (filtro por `.md` / `.txt`).
- Imagens continuam em `<root>/.solon/assets/` — são compartilháveis
  entre canvases de arquivos diferentes do mesmo projeto.

## [0.4.2] — 2026-04-17 — Canvas livre: desenho, texto, imagens e arrows curvas

O canvas agora suporta o vocabulário visual completo esperado de uma
ferramenta Miro-like para escritores: encurvar arrows, desenhar à mão livre,
soltar anotações soltas e colar imagens de referência.

### Adicionado
- **Arrows encurváveis** (estilo Miro): quando uma arrow está selecionada,
  aparece um handle no meio da curva. Arraste para encurvar; duplo clique
  reseta para a linha reta. Bend é persistido em `canvas.json`
  (`CanvasArrow.bend = { dx, dy }`) — offset do control point relativo ao
  midpoint, imune a mudanças de posição dos cards.
- **Free-draw (ferramenta "Desenhar", atalho `P`)**: traço à mão livre em
  5 cores editoriais (tinta/sangue/índigo/marcador/floresta) e 3 espessuras.
  Pontos são acumulados em array flat `[x0,y0,x1,y1,…]` em world coords.
  Durante o desenho, o traço é renderizado localmente (sem commit na store
  a cada pixel); commit ocorre no `mouseup`.
- **Texto flutuante (ferramenta "Texto", atalho `T`)**: clique no canvas
  para soltar texto cru — sem caixa/fundo. Útil para títulos de seção
  ("Ato I", "Subplot Elara"). Suporta bold, 5 cores e 4 tamanhos.
  Edição inline, blur com texto vazio remove o node.
- **Paste de imagens (Ctrl+V)**: cole qualquer imagem do clipboard no
  canvas. Em Tauri, os bytes vão para `<root>/.solon/assets/<id>.<ext>` e
  o `canvas.json` guarda apenas o path relativo. Web (dev): fallback em
  data URL. Imagens maiores que 420px são reduzidas no paste mantendo
  aspect ratio; resize por handle no canto inf-dir também respeita aspect.
- **Toolbar com modos**: 3 botões (Selecionar/Desenhar/Texto) no topo,
  paleta de cores aparece em draw/text, slider de espessura só em draw.
- **QoL**:
  - Atalhos `V`/`P`/`T` para trocar de ferramenta.
  - `Ctrl+D` duplica o card selecionado (cenas não duplicam, por design —
    dois cards apontando pro mesmo arquivo confundiria o snapshot).
  - `Esc` volta para o modo Selecionar além de deselecionar/cancelar link.
  - `Delete`/`Backspace` agora funciona em qualquer entidade selecionada
    (card, arrow, texto, traço, imagem) via `removeSelected()`.

### Alterado
- `CanvasDoc` ganha `texts: CanvasText[]`, `strokes: CanvasStroke[]`,
  `images: CanvasImage[]`. `normalize()` preenche defaults vazios para
  projetos criados em 0.4.0/0.4.1 (leitura é backward-compatível).
- `ArrowLayer` migrou de cubic (`C`) para quadratic (`Q`) bezier — mais
  simples de controlar com um único ponto de bend e alinhado ao Miro.
- Persistence subscribe agora observa mudanças em todas as coleções
  (texts/strokes/images), não só cards/arrows.
- Troca de projeto limpa o cache de blob URLs das imagens
  (`clearImageUrlCache`) — evita colisão se dois projetos reutilizarem
  nomes de assets.

### Arquivos novos
- `src/lib/canvasImages.ts` — saveImageForCanvas / resolveImageUrl / cache.
- `src/components/Canvas/StrokeLayer.tsx` — SVG dos traços + live stroke.
- `src/components/Canvas/FloatingText.tsx` — texto cru com ações.
- `src/components/Canvas/ImageNode.tsx` — imagem com drag/resize.

### Tauri
- Capabilities ganhou `fs:allow-write-file` e `fs:allow-read-file` para
  permitir I/O binário das imagens (o `*-text-file` não basta).

### Próximos
- Frames nomeados (grupos visuais: Ato I, Ato II).
- Borracha no free-draw (hoje só dá pra selecionar+Delete traço inteiro).
- Labels nas arrows.
- Ordem linear — botão "linearizar" que ordena cards por um capítulo.

---

## [0.4.1] — 2026-04-17 — Scene-linked cards

O diferencial do Solon sobre um canvas genérico: os cards do canvas podem ser
*cenas reais* do projeto, não apenas texto livre. Arrastar um `.md` da Sidebar
para o canvas cria um card que mostra título, status, POV, local, tempo e
sinopse — e se sincroniza ao vivo enquanto você edita a cena no editor.

### Adicionado
- **Drag-and-drop Sidebar → Canvas**: arraste qualquer `.md` da árvore de
  arquivos para o canvas; surge um card de cena na posição do cursor.
- **Card de cena** (`kind: "scene"`):
  - Título em serifada; status pill colorida no canto.
  - Borda esquerda (4px) colorida pelo status (âmbar/verde/sépia).
  - Linha de metadados: POV · local · tempo, cada um com seu ícone
    (User / MapPin / Clock).
  - Sinopse do frontmatter ou, na falta, primeiras linhas do corpo
    (fallback até 160 chars, ignora headings/blockquotes/listas).
  - Duplo clique ou botão `FileText` → abre a cena no editor (Ctrl+1 volta).
  - Evita duplicar: arrastar a mesma cena 2x só seleciona o card existente.
  - Estado "órfão" — se o arquivo some (rename externo / remoção externa),
    o card mostra "Arquivo não encontrado" em âmbar.
- **Live sync**: enquanto você edita uma cena no editor, todos os cards
  linkados a ela se atualizam em tempo real (debounce 300ms). Mudou o
  status? O card muda de cor. Mudou a sinopse? O card refresca.
- **Refresh ao entrar no canvas**: sempre que você alterna Editor→Canvas,
  os snapshots de todos os scene cards são re-lidos do disco, capturando
  mudanças em arquivos que não estavam abertos.
- **Rewire em renames**: renomear um `.md` na Sidebar repõe o `scenePath`
  de todos os cards linkados automaticamente (não vira órfão falso).
- Helper `src/lib/sceneSnapshot.ts` (`readSceneSnapshot`, `makeSnapshot`).
- Hook `useSceneCardSync` montado no App.

### Alterado
- Paleta de cores do card só aparece em cards de texto (cenas têm cor
  derivada do status).
- `DEFAULT_SCENE_CARD_W/H` um pouco maiores (260×150) para caber os metadados.

### Arquitetura — por que snapshot vs live-read
Cards lêem de um *snapshot* em memória, não do disco a cada render. Três
motivos: (1) zero IO no render loop, (2) o canvas continua responsivo mesmo
com 100+ cards, (3) o arquivo `.solon/canvas.json` fica autossuficiente —
abre instantaneamente, sem esperar leitura de todas as cenas. Consistência é
mantida por dois caminhos: sync imediato do editor (via subscribe na store)
e refresh em duas situações explícitas (entrada no canvas e rename).

### Próximos
- Labels nas arrows ("causa", "consequência", "flashback").
- Filtro visual: mostrar só cenas com status X / POV Y.
- Ordem linear — botão "linearizar" que ordena cards horizontalmente na
  ordem de um capítulo.
- Frames nomeados (Ato I, Ato II, Clímax).

---

## [0.4.0] — 2026-04-17 — Canvas MVP (Miro-inspired)

Primeira versão do **canvas de storyboard** — um espaço livre, infinito, com
pan/zoom e cards arrastáveis. A ideia aqui não é replicar o canvas do Obsidian
(que é basicamente um grid com edges), mas sim aproximar da experiência de
Miro/FigJam: escritor bota cards onde quiser, conecta com setas, movimenta à
vontade para organizar a trama visualmente.

### Adicionado
- **Canvas view** alternável com o Editor via toggle Editor/Canvas no Titlebar
  (Ctrl+1 / Ctrl+2). Sidebar (árvore de arquivos) continua visível em ambas as
  visões; Inspector e Outline são específicos do editor e somem no canvas.
- **Infinite canvas** com pan/zoom:
  - Wheel / trackpad pinch → zoom ancorado no cursor.
  - Trackpad two-finger → pan.
  - Space + drag ou botão do meio → pan.
  - Grid sépia de fundo que escala com o zoom.
- **Cards freeform**:
  - Duplo clique no fundo cria card na posição.
  - Duplo clique no card entra em modo edição (textarea).
  - Arrastar para mover, resize handle no canto inf-direito.
  - Paleta de 6 cores (sépia, âmbar, verde, rosa, azul, lavanda).
- **Conexões (arrows)** entre cards:
  - Botão `Link2` no card → clique no destino para conectar.
  - Curvas bezier suaves com marcador de ponta.
  - Hit area grossa (14px) para facilitar clique; duplo clique remove.
- **Toolbar flutuante** no topo: novo card, zoom ±, percentual de zoom,
  fit all (F), reset viewport.
- **Atalhos do canvas**: `N` novo card, `Delete` remove selecionado, `Esc`
  cancela link/deseleciona, `F` fit all, `Space` pan.
- **Persistência**: `.solon/canvas.json` na raiz do projeto. Debounce 1s para
  mudanças de cards/arrows, 3s para pan/zoom (viewport muda muito). Flush
  final ao trocar de projeto/desmontar.
- **Store dedicada** (`useCanvasStore`): separada da `useAppStore` porque o
  ciclo de save é diferente (arquivo único por projeto, não por cena) e
  mudanças de alta frequência (drag, zoom) não devem re-renderizar o editor.

### Alterado
- **Store principal** ganha `activeView: "editor" | "canvas"` + `setActiveView`
  e `toggleActiveView`.
- **AppLayout** oculta painel direito (Inspector/Outline) quando em canvas —
  ambos são específicos do editor.
- **Titlebar** ganha um segmented toggle Editor/Canvas antes dos ícones de
  painel.
- `.solon/` fica oculto na Sidebar (já filtrávamos `.startsWith(".")`).

### Arquitetura — por que freeform antes de scene-linking
Scene-linking (cards que puxam sinopse/status do frontmatter de `.md`) é o
diferencial do Solon sobre canvas genéricos. Mas ele *depende* de um canvas
freeform que funcione bem — pan/zoom suave, drag sem jitter, arrows estáveis.
Implementar scene-linking direto sobre um canvas frágil esconde bugs atrás
de dados reais. Nesta versão o esqueleto foi validado; 0.4.1 liga cards a
cenas via `scenePath` (campo já presente no tipo `CanvasCard`).

### Próximos passos do canvas (roadmap curto)
- Cards linkados a cenas (arrastar arquivo da Sidebar → card com synopse +
  borda colorida pelo status).
- Frames/groups para agrupar arcos narrativos.
- Labels nas arrows ("causa", "consequência", "flashback").
- Múltiplos canvases por projeto (`.solon/canvas-<slug>.json`).
- Mini-mapa no canto.

---

## [0.3.1] — 2026-04-17

### Adicionado
- **Toggle independente do Inspector** (Ctrl+K ou botão `Info` na Titlebar).
  Inspector e Outline agora ligam/desligam separadamente:
  - Ambos → Inspector no topo + Outline embaixo (comportamento 0.3.0).
  - Só Inspector → ocupa todo o painel direito.
  - Só Outline → ocupa todo o painel direito (resolve pedido de "manter só o índice").
  - Nenhum → painel direito some.
- Botão `X` no header do Inspector para fechar rapidamente.
- Dependências: `marked` (MD→HTML) e `turndown` (HTML→MD) + tipos.

### Alterado
- **Markdown bridge reescrito** de parser caseiro para `marked` + `turndown`.
  - Bullets, listas ordenadas, blockquote, HR e formatação inline aninhada agora
    fazem round-trip corretamente.
  - Listas ordenadas persistiam como `- item` (bug do parser antigo) — agora
    persistem como `1. item`, `2. item`.
  - Blockquote, strike, code inline preservam formatação interna (bold/italic
    dentro de citação).
  - Regra custom de strikethrough (`~~texto~~`) — turndown não traz por padrão.
  - HR canônico como `---` (antes variava).
- Titlebar usa ícones dedicados: `Info` (Inspector), `ListTree` (Outline).

### Conhecido
- Indent de parágrafo (`IndentExtension`, Tab) não tem representação em
  Markdown — some ao salvar. Reaplica com Tab ao reabrir. Para persistir,
  precisaríamos de uma convenção própria (ex: `<!-- indent -->` prefixo).

---

## [0.3.0] — 2026-04-17 — Scene Metadata Foundation

Primeira camada que separa o Solon de um "Typora genérico": cada cena ganha
metadados estruturados (POV, local, tempo, status, sinopse, meta de palavras, tags)
persistidos como YAML frontmatter no próprio `.md`. É a fundação sobre a qual
Canvas, Corkboard, Fountain e Export vão ser construídos.

### Adicionado
- **YAML frontmatter por cena** (`src/lib/frontmatter.ts`):
  - `parseDocument(raw)` → `{ meta, body }`.
  - `serializeDocument(meta, body)` escreve de volta.
  - Campos estáveis do contrato `SceneMeta`: `pov`, `location`, `time`, `status`
    (`draft` | `revised` | `final`), `synopsis`, `wordTarget`, `tags[]`.
  - Tolerante: arquivo sem frontmatter é tratado como body puro; YAML inválido
    não corrompe (fallback silencioso).
  - Snake_case no YAML, camelCase no código (`word_target` ↔ `wordTarget`).
- **Tipos centrais** (`src/types/scene.ts`): `SceneMeta`, `SceneStatus`,
  `SCENE_STATUSES` com cores canônicas (draft âmbar, revised verde, final sépia).
- **Inspector panel** (`src/components/Inspector/Inspector.tsx`):
  - Edita todos os campos da cena ativa.
  - Barra de progresso de palavras vs meta com cores (âmbar → verde ao bater 100%).
  - Editor de tags com chips (Enter/vírgula para adicionar, Backspace para remover).
  - Status selector com pílulas coloridas.
- **Painel direito reorganizado**: Inspector no topo + Outline embaixo,
  separador de 1px. Inspector ocupa a parte principal; Outline tem altura
  `min(40%, 280px)`.
- **Status pill na Titlebar**: mostra status + POV da cena ativa.
- **StatusBar com meta de palavras**: `1234 / 1500 palavras` + mini-barra de
  progresso quando há `wordTarget` definido; volta ao formato antigo quando não há.
- **Auto-save centralizado** (`src/hooks/useAutoSave.ts`):
  - Subscreve mudanças em `fileBody` e `sceneMeta` via Zustand `subscribe`.
  - Debounce de 1.2s com flush imediato em Ctrl+S.
  - **Flush automático ao trocar de arquivo** (não perde edições pendentes do
    arquivo anterior).
- **Dependências**: `js-yaml` + `@types/js-yaml`.

### Alterado
- **Store**: `fileContent` → `fileBody` (corpo sem frontmatter) + novo
  `sceneMeta`. Novas actions `setFileBody`, `setSceneMeta`, `patchSceneMeta`.
  `setActiveFile(path, name, body, meta)` com assinatura atualizada.
- **Editor**: removida lógica de save (Ctrl+S, debounce, htmlToMarkdown no save)
  — agora só sincroniza body no store via `onUpdate`. `useAutoSave` assume a
  responsabilidade de persistir. Loading guard via `lastLoadedPathRef` evita
  re-render loop quando body muda no próprio store.
- **useFileSystem**: `openFile` e pós-rename agora fazem `parseDocument` antes
  de popular o store; `deleteNode` limpa `fileBody` e `sceneMeta` em vez de
  `fileContent`.
- **Outline panel**: largura padrão 220 → 260 (abriga campos do Inspector com
  folga); limites mín/máx do resize de 160–400 → 200–440.

### Removido
- `fileContent` do store (substituído por `fileBody` + `sceneMeta`).
- Save inline no `Editor.tsx` (movido para `useAutoSave`).

### Arquitetura — por que essa camada vem antes
Canvas Miro-like, Corkboard e Fountain são *vistas* sobre o mesmo dado: o
conjunto de cenas do projeto com seus metadados. Se o canvas nascer antes do
SceneMeta, vira mural de post-its desconectados do projeto. Com SceneMeta
estabelecido, cada card do canvas é uma *projeção* de uma cena real:
sinopse puxa do frontmatter, borda colorida pelo status, arrastar reordena,
editar no editor reflete no canvas. Mesmo princípio vale para exportar
(compilar um romance respeitando status "final" apenas) e para Fountain
(cenas viram sluglines `INT. LOCAL — TEMPO` a partir de `location` e `time`).

---

## [0.2.0] — 2026-04-17

### Adicionado
- **Focus Mode funcional** (F11): oculta Sidebar, Outline e Toolbar do editor para escrita sem distrações.
- **Persistência da pasta raiz**: última pasta aberta é salva em `localStorage` (`solon:rootFolder`) e restaurada automaticamente no próximo lançamento.
- **Operações de arquivo/pasta na Sidebar**:
  - Criação de arquivo (`.md`) e pasta via botões no header ou menu de contexto.
  - Renomear e excluir (com confirmação) via menu de contexto (botão direito).
  - Submenus específicos para arquivos vs pastas.
- **Atualização automática da árvore** ao retornar o foco para a janela (detecta mudanças externas).
- **Botão de refresh manual** no header da Sidebar.
- **Capabilities Tauri 2** (`src-tauri/capabilities/default.json`): permissões para `fs` (read/write/mkdir/rename/remove/exists), `dialog` e `shell`. Escopo `**` para arquivos arbitrários do projeto.

### Alterado
- `useFileSystem` agora expõe `refresh`, `restoreLastFolder`, `createFile`, `createFolder`, `renameNode`, `deleteNode`.
- `AppLayout` consome `focusMode` para esconder Sidebar/Outline.
- `Editor` oculta o toolbar em Focus Mode.
- `setRootFolder` escreve em `localStorage` automaticamente.
- `buildFileTree` usa separador de caminho multi-plataforma (Windows backslash / Unix slash).

### Removido
- Bloco `plugins` legado estilo Tauri 1 no `tauri.conf.json` (allowlist inválido em v2 — substituído por capabilities).

---

## [0.1.0] — estado inicial

### Adicionado
- Shell Tauri 2 + Vite + React 18 + TypeScript.
- Layout de 3 colunas com resize handles (Sidebar / Editor / Outline).
- **Editor TipTap** com extensões: Document, Paragraph, Heading (1–6), Bold, Italic, Strike, Blockquote, BulletList, OrderedList, ListItem, CodeBlock, HorizontalRule, History, Placeholder, Typography, CharacterCount.
- **IndentExtension**: indentação de primeira linha de parágrafo (Tab / Shift+Tab) no estilo romance.
- **Toolbar do editor** com undo/redo, H1–H3, formatação inline, blockquote, HR, listas e presets rápidos de Capítulo/Cena.
- **Conversor Markdown ↔ HTML manual** (`markdownBridge.ts`) — headings, blockquote, listas, HR, bold/italic/strike/code inline.
- **Sidebar** com árvore de arquivos (leitura).
- **Outline** com extração de headings e scroll via `CustomEvent("solon:scroll-to")`.
- **StatusBar** com contagem de palavras e caracteres.
- **Titlebar** custom com drag region e botões de painel.
- **Auto-save** debounce de 1.5s + Ctrl+S manual.
- **Atalhos globais**: Ctrl+\ (sidebar), Ctrl+J (outline), F11 (focus mode), Ctrl+S (salvar).
- **Tema editorial sepia** (`globals.css`) com fontes Lora (texto) e Inter (UI); H1 com filete dourado, H3 em caixa-alta, HR como "* * *".
- **Fallback mock** no browser (sem Tauri) com projeto de exemplo.
- Integração Tauri `fs`, `dialog`, `shell` (registro do plugin).
- Zustand como store global (`useAppStore`).

### Conhecido / Pendente no 0.1
- Focus Mode alterna o estado mas nenhum componente consumia o valor → resolvido em 0.2.0.
- Sem persistência de contexto → resolvido em 0.2.0.
- Sidebar apenas leitura → resolvido em 0.2.0.
- Tauri 2 capabilities ausente → resolvido em 0.2.0.

---

## Próximos passos sugeridos

- **File watcher real** via `@tauri-apps/plugin-fs` `watchImmediate` em vez de refresh on-focus.
- **Múltiplas abas** de arquivos abertos.
- **Busca** (Ctrl+F local no arquivo, Ctrl+Shift+F global no projeto).
- **Export**: HTML, PDF, EPUB.
- **Metadados de projeto** (`.solon/project.json`) com ordem manual de capítulos.
- **Modo escuro**.
- **Snippets / templates** (cena, diálogo, flashback).
- **Markdown bridge mais robusto** — considerar `marked` + `turndown` para cobrir edge cases (links, imagens, listas aninhadas).
