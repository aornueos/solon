# Solon

A writer-first Markdown workspace for fiction, story structure, and long-form creative writing.

Solon is not a productivity dashboard, not a knowledge graph, and not a generic Markdown editor with a writing theme.
It is a local-first desktop app built around the way fiction writers actually work: drafts, chapters, scenes, characters, storyboards, revisions, and the quiet terror of needing the file to still exist tomorrow.

Built with **Tauri 2 + React + TipTap**. Notes live on your disk as plain `.md` files; you can open the same project in any other Markdown tool whenever you want.

---

## Why Solon

Most writing and note-taking apps fall into one of two traps.

Some are beautiful Markdown editors, but stop at the page. They are clean, focused, and pleasant — until the project becomes a novel, with chapters, references, characters, structure, notes, and visual planning.

Others are powerful knowledge-management systems, but they treat writing like a database: graphs, backlinks, dashboards, templates, plugins, daily notes, and an endless architecture around the actual text.

Solon takes a narrower path.

It is built for **linear fiction**: scenes, chapters, characters, frontmatter, storyboards, local files, and long-form writing projects. The features compose around that focus, and deliberately stop where writing a story becomes managing a vault.

What that means in practice:

- **Your work stays yours.** A Solon project is just a folder of Markdown files. Open it in VSCode, sync it over Dropbox, version it with git, or leave Solon entirely without exporting your own writing back to yourself.
- **The editor serves the draft.** No streaks, no pomodoros, no heatmaps, no productivity theater. Solon opens your project, protects your files, and gets out of the way.
- **Structure without bloat.** Wikilinks, frontmatter, outline, inspector, backlinks, and per-file canvas exist to support fiction writing — not to turn your novel into a second operating system.
- **Resilience by default.** Atomic file writes, crash-recovery drafts, local history snapshots, and signed auto-updates protect the work without making the writer think about infrastructure.
---

## Features

### Writing

- **TipTap-based Markdown editor** with full roundtrip — bold/italic/strike, headings, lists, blockquotes, tables (GFM), horizontal rules, inline code, code blocks, text alignment, highlights, smart dashes.
- **Native pt-BR spellcheck** running in a Rust backend (Levenshtein + diacritic-aware ranking, ~5–15ms per suggestion against a 312k-word dictionary; personal dictionary persisted).
- **Wikilinks** with `[[note]]` syntax: autocomplete dropdown as you type `[[`, `Ctrl/Cmd+click` to navigate, **backlinks panel** in the Inspector showing every note that links to the current one.
- **Typewriter mode** — caret stays vertically centered, the page scrolls underneath.
- **Reading mode** — hides every chrome element for distraction-free editing (`Ctrl+Shift+R` toggle; `Esc`/`F11`/`Ctrl+Shift+Esc` exit).
- **Focus mode** — collapses sidebar/outline/inspector but keeps tabs and toolbar.
- **Real fullscreen** via `F11` (uses the OS window API).
- **Snippet expansion** — `;trigger` becomes the matching replacement defined in `.solon/snippets.json`.
- **Inline images** — paste or drop into the editor, stored under `.solon/assets/` and referenced as `![](...)` Markdown.
- **Find & replace** with regex, whole-word, and preserve-case options.

### Project & Files

- **Tabs** — drag to reorder, middle-click to close, middle-click on sidebar to open in background, `Ctrl+W`/`Ctrl+Tab`/`Ctrl+Shift+T` keyboard navigation. Tabs persist across sessions.
- **Multi-window** — drag a tab out of the bar to detach it into its own window, or use the context menu.
- **Split panes** — reference another note (read-only) on the right side while writing.
- **Sidebar** with drag-and-drop reorder/move, manual ordering persisted per folder.
- **Tag filter** — filter the sidebar by frontmatter tag.
- **Recents** on the home page.
- **Quick scratchpad** (`Ctrl+Shift+N`) — ephemeral buffer to capture a fragment without committing to a filename.
- **Duplicate file** from the context menu.

### Storyboard (Canvas)

- **Per-file canvas** — every `.md` has its own infinite canvas, stored as a sidecar `<file>.canvas.json`.
- **Cards**, **freehand strokes**, **floating text**, **arrows** with editable bends, **pasted images**.
- **Scene cards** snapshot the frontmatter (POV, location, time, status, synopsis) of any note dropped into the canvas. Edit the note, the card updates.
- **Marquee selection** for batch operations, **fit-all** view, snap-to-grid.

### Structure & Navigation

- **Outline panel** — drag-to-reorder sections in the document, word count per section, `Tab`/`Shift+Tab` on a heading to promote/demote.
- **Inspector** — edit frontmatter (POV, location, time, status, synopsis, word target, tags), word-count goal with progress bar, list of backlinks, button to open the local-history viewer.
- **Command palette** (`Ctrl+K`) — fuzzy search every file and command.
- **Global search** (`Ctrl+Shift+F`) — search note content across the project, parallelized reads.
- **Shortcuts cheatsheet** (`Ctrl+/`) — grouped reference of every keyboard shortcut.

### Resilience

- **Atomic file writes** — every save lands as `<file>.<rand>.solon-tmp` then atomically `rename`s into place. A crash during a write never leaves the destination truncated.
- **Crash recovery** — while a file is dirty, drafts are written to `<project>/.solon/.recovery/` every 5 seconds. On next boot, Solon offers to restore them.
- **Local history** — snapshots of the previous content saved before every write, viewable in a dialog and restorable from any point.
- **Path security** — every filesystem operation is checked against the project root; symlink/`..` traversal cannot escape the folder, and a deny list covers `~/.ssh`, `~/.aws`, credential files, etc.

### Look & Feel

- **Six themes** — light (sepia), creme, sepia, gray (cool steel-blue accents), midnight (deep navy with sky accents), and Tokyo (purple/cyan night).
- **Editorial typography** — Lora serif by default, with Inter and Courier alternates; configurable line height, paragraph spacing, indent size, max column width, and zoom.
- **Theme-aware dropdowns** — native `<select>` popups follow the active theme via `color-scheme`.
- **App zoom** — separate from text zoom, scales the entire UI for high-DPI screens.

### Export

- **PDF** — single file or the whole project as a book. Book/A4/A5 page sizes, serif/sans typography, optional table of contents, cover, page breaks per section, hyphenated justification. Uses the browser print dialog so you save via "Microsoft Print to PDF" or equivalent — no bundled converter, no dependency bloat.

### Updates

- **Auto-update** via the Tauri updater plugin. Each release is signed with an Ed25519 key; the app verifies the signature before applying the update. Skip-a-version supported. 6-hour throttle on background checks.

---

## Installation

Latest installers are on the [Releases page](https://github.com/aornueos/solon/releases/latest).

### Windows

Download `Solon_x.y.z_x64-setup.exe` (or the MSI), run it. The app then auto-updates from inside; you won't need to come back to the page.

> **SmartScreen warning**: Solon's installer is not yet signed with an Authenticode certificate. On first install you'll see "Windows protected your PC". Click *More info → Run anyway*. The Ed25519-signed updater means subsequent updates are still cryptographically verified.

### macOS / Linux

Not currently distributed — the release workflow targets `windows-latest` only. Building from source works on both (see below); a multi-OS release matrix is on the roadmap.

---

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Command palette | `Ctrl+K` |
| Global search | `Ctrl+Shift+F` |
| Find in note | `Ctrl+F` |
| Local history | `Ctrl+Alt+H` |
| Editor / Canvas / Home | `Ctrl+1` / `Ctrl+2` |
| New empty note | `Ctrl+T` |
| Scratchpad | `Ctrl+Shift+N` |
| Close tab | `Ctrl+W` |
| Next/Previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Reopen closed tab | `Ctrl+Shift+T` |
| Toggle sidebar / outline / inspector | `Ctrl+\` / `Ctrl+J` / `Ctrl+Alt+I` |
| Focus mode | (Command Palette) |
| Reading mode | `Ctrl+Shift+R` |
| Fullscreen | `F11` |
| Toggle theme | `Ctrl+Shift+L` |
| Settings | `Ctrl+,` |
| Cheatsheet | `Ctrl+/` |
| Export to PDF | `Ctrl+Shift+E` |
| Panic — reset all special modes | `Ctrl+Shift+Esc` |
| Promote/Demote heading (on a heading line) | `Tab` / `Shift+Tab` |
| Indent first line (in a paragraph) | `Tab` |
| Zoom text | `Ctrl+Scroll` |

---

## Project layout

```
<your-project>/
├── chapter-01.md         ← plain Markdown, YAML frontmatter optional
├── chapter-02.md
├── characters/
│   └── elara.md
├── chapter-01.canvas.json   ← optional, sidecar canvas (storyboarding)
└── .solon/                  ← Solon's project metadata (safe to commit)
    ├── assets/              ← pasted images
    ├── history/<file>/      ← local snapshots, one per save
    ├── .recovery/           ← crash-recovery drafts (cleared after save)
    ├── order.json           ← manual sidebar ordering
    └── snippets.json        ← optional snippet definitions
```

Frontmatter accepted in any `.md`:

```yaml
---
pov: Elara
location: Aldeia de Arken
time: Manhã, dia 3
status: draft     # draft | revised | final
synopsis: Elara descobre o portal.
wordTarget: 1500
tags: [romance, capítulo-1]
---
```

---

## Tech stack

- **[Tauri 2](https://tauri.app/)** — desktop shell, native window APIs, signed auto-updates, OS dialogs.
- **[React 18](https://react.dev/)** + **TypeScript** — UI.
- **[TipTap](https://tiptap.dev/)** — editor (built on ProseMirror).
- **[Zustand](https://github.com/pmndrs/zustand)** — state, with granular selectors to keep keystroke-frequency renders cheap.
- **[Tailwind CSS](https://tailwindcss.com/)** — styling.
- **[marked](https://marked.js.org/) + [Turndown](https://github.com/mixmark-io/turndown)** — Markdown ↔ HTML bridge, with DOMPurify sanitization on the way in.
- **[Vite](https://vitejs.dev/)** — build.
- **Rust** — native spellcheck (Levenshtein + diacritic-aware suggestions over a 312k-word Portuguese dictionary, ~5–15ms per suggestion).

---

## Development

### Requirements

- [Node.js](https://nodejs.org/) 20+
- [Rust toolchain](https://www.rust-lang.org/tools/install) (stable)
- Platform-specific build deps for Tauri — see [Tauri's prerequisites](https://tauri.app/start/prerequisites/)

### Run locally

```bash
git clone https://github.com/aornueos/solon.git
cd solon
npm install
npm run tauri dev   # opens the desktop app with HMR
```

`npm run dev` alone starts the Vite dev server in the browser — most filesystem features won't work there (no `__TAURI_INTERNALS__`), but it's useful for UI iteration.

### Build

```bash
npm run build         # type-check + Vite build (frontend only)
npm run tauri build   # produces the native installers
```

### Other scripts

```bash
npm run version:set <X.Y.Z|patch|minor|major>   # bumps version everywhere
npm run release:prepare                          # validates + builds + prints the release commands
npm run brand:icons                              # regenerates the icon set from the SVG
npm run test:robustness                          # runs the robustness test suite
npm run kill                                     # kills any stuck Solon process (dev helper)
```

---

## Releases

Pushing a tag `v*` (e.g. `v0.8.7`) triggers `.github/workflows/release.yml`, which:

1. Builds the bundles on each target in the matrix.
2. Signs them with the Ed25519 key from `TAURI_SIGNING_PRIVATE_KEY` (GitHub secret).
3. Uploads the installers + `.sig` files + `latest.json` as release assets.
4. The `latest.json` URL configured in `src-tauri/tauri.conf.json` makes installed apps detect the new version automatically.

To cut a release locally:

```bash
npm run version:set patch
npm run release:prepare   # validates tag/pubkey/updater config, runs build
git add package.json package-lock.json src src-tauri scripts
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

The required GitHub secrets are documented in the header of `.github/workflows/release.yml`.

---

## Configuration

Most behavior is configured from `Settings` (`Ctrl+,`). Per-project files Solon reads:

- **`.solon/snippets.json`** — `{ ";trigger": "replacement", ... }`. Custom triggers must start with `;`.
- **`.solon/order.json`** — manual sidebar ordering (managed automatically by drag-and-drop).
- **`.solon/history/<file>/`** — local snapshots (managed automatically; configurable via the "Local history" setting).

User preferences live in `localStorage` and follow the `solon:*` key prefix.

---

## Roadmap / Not on the roadmap

**Likely to come**

- macOS / Linux release builds.
- DOCX export (Shunn manuscript format for submission).
- Authenticode signature for the Windows installer.
- Collapsible headings inside the editor.
- Aliased wikilinks (`[[file|display name]]`).

**Deliberately out of scope**

- Knowledge-graph view of wikilinks (the wikilink feature is a navigation shortcut, not the start of a PKM).
- Daily notes, templated pages, plugins.
- Productivity tracking (streaks, session timers, heatmaps).
- Real-time collaboration. Solon is single-author by design.

---

## Contributing

This is a personal project — issues and pull requests are welcome but treated case by case. Please open an issue describing the change before opening a PR.

### Code style

- TypeScript with strict mode. `tsc --noEmit` must pass.
- Comments explain **why**, not what — leave room for the next reader to make a different call.
- Performance: the editor runs at keystroke frequency. Subscriptions to the Zustand store should select primitives or stable refs only; broad `useAppStore()` calls in hot components will re-render the world.
- Filesystem operations: writes must use `lib/atomicWrite.ts`; paths must pass `assertInsideProject` from `lib/pathSecurity.ts`.

---

## License

To be defined. Until then, source is available for personal use and study.
