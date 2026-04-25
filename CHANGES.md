# Solon — Registro de Alterações

## Legenda
- ✅ Concluído
- 🔄 Em andamento
- 📋 Pendente
- 🐛 Bug conhecido

---

## Fase 1 — Fundação (concluída)

### ✅ Estrutura do projeto
- Scaffolding Tauri 2 + React 18 + TypeScript
- Vite como bundler
- TailwindCSS para estilização
- Zustand para estado global

### ✅ Layout de 3 painéis
- Sidebar (explorador de arquivos)
- Editor central (TipTap WYSIWYG)
- Outline (índice de headings)
- Painéis redimensionáveis por drag
- Titlebar com nome do arquivo ativo
- Status bar (palavras, caracteres, caminho do arquivo)

### ✅ Editor WYSIWYG com Markdown
- Renderização ao vivo (como Typora)
- Suporte a H1–H6, negrito, itálico, tachado
- Blockquotes (diálogos)
- Quebra de cena com HR (`---`)
- Listas ordenadas e não ordenadas
- Code blocks
- Auto-save com debounce de 1.5s
- Atalho Ctrl+S para salvar manual

### ✅ Sidebar
- Leitura de pastas locais (via Tauri fs plugin)
- Árvore de arquivos expansível
- Destaque do arquivo ativo
- Filtro: mostra apenas `.md` e `.txt`
- Mock para desenvolvimento no browser

### ✅ Outline (Índice)
- Detecta headings H1–H6 em tempo real
- Indentação visual por nível
- Clique navega até o heading no editor

### ✅ Toolbar
- Undo/Redo
- H1, H2, H3
- Negrito, Itálico, Tachado
- Blockquote, Quebra de cena
- Listas
- Presets rápidos: "Capítulo" e "Cena"

### ✅ Parser Markdown ↔ HTML
- Conversão MD→HTML ao abrir arquivo
- Conversão HTML→MD ao salvar
- Suporte a: headings, blockquotes, HR, listas, inline (bold/italic/strike/code)

### ✅ Tema visual
- Paleta: papel parchment + tinta (tons quentes)
- Fonte de texto: Lora (serif, ideal para ficção)
- Fonte de UI: Inter
- Scrollbar discreta

---

## Fase 1.1 — Melhorias em andamento

### ✅ Fix do parser de blockquotes
- Bug: `>` era escapado para `&gt;` antes de processar blockquotes
- Corrigido: pipeline reordenado — sintaxe MD processada antes do escape HTML

### ✅ Indentação de parágrafo com Tab
- Tab em parágrafo aplica `text-indent: 2em` (primeira linha recuada — estilo romance)
- Shift+Tab remove a indentação
- Não age em headings, listas ou outros blocos

### ✅ Distinção visual de headings
- H1: serif 2rem, bold, underline dourado — título de capítulo
- H2: serif 1.35rem, semi-bold, borda lateral dourada — seção/ato
- H3: sans-serif 0.72rem, uppercase espaçado marrom — marcador de cena
- H4–H6: sans-serif pequeno, uppercase sutil — notas internas

### ✅ Fix CSS layer
- Estilos do `.ProseMirror` movidos para fora de `@layer components`
- Garante que sobrepõem quaisquer estilos injetados por bibliotecas (TipTap, etc.)

---

## Fase 2 — Novel Mode (planejado)

### 📋 Presets de formatação completos
- Preset "Romance": fonte serifada, entrelinha 1.8, margens amplas
- Preset "Manuscrito": estilo de submissão editorial (Courier, duplo espaço)
- Preset "Roteiro": formato técnico
- Painel de configuração de preset ativo

### 📋 Notas de personagem inline
- Marcação de nomes de personagens
- Popup com card de informações do personagem
- Consistência de nomes (alerta se nome mudar de grafia)

### 📋 Meta de escrita (writing goals)
- Configurar meta de palavras por sessão ou por projeto
- Barra de progresso discreta na status bar

---

## Fase 3 — Canvas (planejado)

### 📋 Board estilo Miro
- Nós com texto rico (não apenas cards)
- Conexões entre nós (linhas/setas)
- Nós de tipos diferentes: cena, personagem, locação, nota
- Arrastar e soltar livremente no canvas infinito
- Zoom in/out com scroll

### 📋 Integração Editor ↔ Canvas
- Abrir um nó de cena abre o arquivo .md correspondente no editor
- Criar cena no canvas cria arquivo .md na pasta do projeto

---

## Fase 4 — Polish & Distribuição (planejado)

### 📋 Modo Foco
- Esconde sidebar e outline
- Editor em largura máxima com margens generosas
- Atalho: F11

### 📋 Temas adicionais
- Tema escuro (tinta sobre papel envelhecido)
- Tema "máquina de escrever" (monocromático)

### 📋 Exportação
- Exportar para PDF (via pandoc ou impressão CSS)
- Exportar para EPUB (estrutura básica)
- Exportar para DOCX (via mammoth ou similar)

### 📋 Build e distribuição
- Compilar `.exe` instalador para Windows (Tauri bundler)
- Assinar binário (opcional para release público)

---

## Bugs conhecidos

### 🐛 Rust não encontrado no PATH do shell
- `rustc` instalado mas não visível no shell atual (sessão precisa ser reiniciada)
- Impede `tauri dev` de rodar no momento
- Solução: fechar e reabrir o terminal após instalação do Rust

### 🐛 Rust não encontrado no PATH do shell
- `rustc` instalado mas não visível no shell atual (sessão precisa ser reiniciada)
- Impede `tauri dev` de rodar no momento
- Solução: fechar e reabrir o terminal após instalação do Rust
