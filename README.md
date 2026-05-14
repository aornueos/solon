# Solon

A Markdown workspace made by a writer for writers.

Solon is a local desktop app for fiction, story structure, and creative writing projects. It is built around drafts, chapters, scenes, characters, storyboards, revisions, and the simple fact that a writer should never have to wonder if the file will still exist tomorrow.

Built with **Tauri 2 + React + TipTap**. Notes live on your disk as plain `.md` files, so the same project can be opened in any other Markdown tool whenever you want.

## Why Solon

Most writing apps miss the point in different ways.

Some Markdown editors are beautiful, clean, and focused, but they stop at the page. That works until the text becomes a novel, with chapters, references, characters, structure, notes, and visual planning.

Some knowledge management tools are powerful, but they treat writing like a database. Graphs, dashboards, templates, plugins, daily notes, backlinks everywhere, and suddenly the story becomes a system to maintain instead of something to write.

Some productivity apps add streaks, timers, heatmaps, and metrics. Solon does not. Writing is already hard enough without turning it into a fitness tracker for guilt.

Solon takes a narrower path.

It is built for **linear fiction**: scenes, chapters, characters, frontmatter, storyboards, local files, and long creative projects. The features exist to support the draft, not to turn the novel into a vault, a dashboard, or a second operating system.

What that means in practice:

* **Your work stays yours.** A Solon project is just a folder of Markdown files. Open it in VSCode, sync it over Dropbox, version it with git, or leave Solon entirely without exporting your own writing back to yourself.
* **The editor serves the draft.** No streaks, no pomodoros, no heatmaps, no productivity theater. Solon opens your project, protects your files, and gets out of the way.
* **Structure without bloat.** Wikilinks, frontmatter, outline, inspector, backlinks, and canvas exist to support fiction writing, not to turn your novel into a private bureaucracy.
* **Resilience by default.** Atomic file writes, recovery drafts, local history snapshots, and signed updates protect the work without making the writer think about infrastructure.

## Features

### Writing

* **TipTap based Markdown editor** with full roundtrip support for bold, italic, strike, headings, lists, blockquotes, tables, horizontal rules, inline code, code blocks, text alignment, highlights, and smart dashes.
* **Native Brazilian Portuguese spellcheck** running in a Rust backend, with Levenshtein distance, ranking aware of accents, suggestions in roughly 5 to 15 ms against a 312k word dictionary, and a persisted personal dictionary.
* **Wikilinks** with `[[note]]` syntax, autocomplete while typing `[[`, `Ctrl/Cmd+click` navigation, and a backlinks panel in the Inspector showing every note that links to the current one.
* **Typewriter mode** keeps the caret vertically centered while the page scrolls underneath.
* **Reading mode** hides every chrome element for focused editing. Toggle with `Ctrl+Shift+R`. Exit with `Esc`, `F11`, or `Ctrl+Shift+Esc`.
* **Focus mode** collapses sidebar, outline, and inspector while keeping tabs and toolbar available.
* **Real fullscreen** through `F11`, using the OS window API.
* **Snippet expansion** turns `;trigger` into the matching replacement defined in `.solon/snippets.json`.
* **Inline images** can be pasted or dropped into the editor. They are stored under `.solon/assets/` and referenced as Markdown.
* **Find and replace** with regex, whole word, and preserve case options.

### Project and Files

* **Tabs** can be reordered, closed with middle click, restored, and persisted across sessions.
* **Multiple windows** let you detach a tab into its own window.
* **Split panes** let you reference another note on the right side while writing.
* **Sidebar** supports drag and drop reorder, file movement, and manual ordering per folder.
* **Tag filter** filters the sidebar by frontmatter tag.
* **Recents** appear on the home page.
* **Quick scratchpad** with `Ctrl+Shift+N` captures fragments without committing to a filename.
* **Duplicate file** is available from the context menu.

### Storyboard

* **Canvas for each file** gives every `.md` file its own infinite canvas, stored as a sidecar `<file>.canvas.json`.
* **Cards, freehand strokes, floating text, arrows, and pasted images** support visual planning without leaving the project.
* **Scene cards** snapshot the frontmatter of any note dropped into the canvas, including POV, location, time, status, and synopsis. Edit the note and the card updates.
* **Marquee selection**, **fit all view**, and **snap to grid** support larger boards.

### Structure and Navigation

* **Outline panel** supports drag to reorder sections, word count per section, and heading promotion or demotion with `Tab` and `Shift+Tab`.
* **Inspector** edits frontmatter fields such as POV, location, time, status, synopsis, word target, and tags.
* **Word count goal** appears with a progress bar.
* **Backlinks** show every note that links to the current file.
* **Local history viewer** opens from the Inspector.
* **Command palette** with `Ctrl+K` searches every file and command.
* **Global search** with `Ctrl+Shift+F` searches note content across the project with parallelized reads.
* **Shortcuts cheatsheet** with `Ctrl+/` shows every keyboard shortcut.

### Resilience

* **Atomic file writes** save through a temporary file before replacing the destination. A crash during a write does not leave the destination truncated.
* **Crash recovery** writes drafts to `<project>/.solon/.recovery/` every 5 seconds while a file is dirty. On the next boot, Solon offers to restore them.
* **Local history** saves snapshots of the previous content before every write. Snapshots can be viewed and restored from the app.
* **Path security** checks every filesystem operation against the project root. Symlink and `..` traversal cannot escape the folder, and a deny list covers sensitive paths such as `~/.ssh`, `~/.aws`, and credential files.

### Look and Feel

* **Six themes**: light, creme, sepia, gray, midnight, and Tokyo.
* **Editorial typography** uses Lora by default, with Inter and Courier as alternates.
* **Reading preferences** include line height, paragraph spacing, indent size, max column width, and zoom.
* **Theme aware dropdowns** make native `<select>` popups follow the active theme through `color-scheme`.
* **App zoom** scales the entire UI separately from text zoom.

### Export

* **PDF export** supports a single file or the whole project as a book.
* **Book, A4, and A5 page sizes** are available.
* **Serif or sans typography**, optional table of contents, cover, page breaks per section, and hyphenated justification are supported.
* Export uses the browser print dialog, so the file can be saved through "Microsoft Print to PDF" or an equivalent system printer. No bundled converter, no dependency bloat.

### Updates

* **Automatic updates** use the Tauri updater plugin.
* Each release is signed with an Ed25519 key.
* The app verifies the signature before applying an update.
* Skip a version is supported.
* Background checks are throttled to every 6 hours.

## Installation

Latest installers are on the [Releases page](https://github.com/aornueos/solon/releases/latest).

### Windows

Download `Solon_x.y.z_x64-setup.exe` or the MSI, then run it. The app updates from inside after installation.

> **SmartScreen warning**: Solon's installer is not yet signed with an Authenticode certificate. On first install you may see "Windows protected your PC". Click *More info → Run anyway*. The Ed25519 signed updater means later updates are still cryptographically verified.

### macOS and Linux

Not currently distributed. The release workflow targets `windows-latest` only.

Building from source works on both. A release matrix for multiple operating systems is on the roadmap.

## Keyboard shortcuts

| Action                             | Shortcut                           |
| :--------------------------------- | :--------------------------------- |
| Command palette                    | `Ctrl+K`                           |
| Global search                      | `Ctrl+Shift+F`                     |
| Find in note                       | `Ctrl+F`                           |
| Local history                      | `Ctrl+Alt+H`                       |
| Editor, Canvas, Home               | `Ctrl+1` / `Ctrl+2`                |
| New empty note                     | `Ctrl+T`                           |
| Scratchpad                         | `Ctrl+Shift+N`                     |
| Close tab                          | `Ctrl+W`                           |
| Next or previous tab               | `Ctrl+Tab` / `Ctrl+Shift+Tab`      |
| Reopen closed tab                  | `Ctrl+Shift+T`                     |
| Toggle sidebar, outline, inspector | `Ctrl+\` / `Ctrl+J` / `Ctrl+Alt+I` |
| Focus mode                         | Command Palette                    |
| Reading mode                       | `Ctrl+Shift+R`                     |
| Fullscreen                         | `F11`                              |
| Toggle theme                       | `Ctrl+Shift+L`                     |
| Settings                           | `Ctrl+,`                           |
| Cheatsheet                         | `Ctrl+/`                           |
| Export to PDF                      | `Ctrl+Shift+E`                     |
| Reset special modes                | `Ctrl+Shift+Esc`                   |
| Promote or demote heading          | `Tab` / `Shift+Tab`                |
| Indent first line in paragraph     | `Tab`                              |
| Zoom text                          | `Ctrl+Scroll`                      |

## Project layout

```txt
<your-project>/
├── chapter-01.md
├── chapter-02.md
├── characters/
│   └── elara.md
├── chapter-01.canvas.json
└── .solon/
    ├── assets/
    ├── history/<file>/
    ├── .recovery/
    ├── order.json
    └── snippets.json
```

A Solon project is plain Markdown with optional YAML frontmatter:

```yaml
---
pov: Elara
location: Aldeia de Arken
time: Manhã, dia 3
status: draft
synopsis: Elara descobre o portal.
wordTarget: 1500
tags: [romance, capítulo-1]
---
```

## Tech stack

* **[Tauri 2](https://tauri.app/)** for the desktop shell, native window APIs, signed updates, and OS dialogs.
* **[React 18](https://react.dev/)** with **TypeScript** for the UI.
* **[TipTap](https://tiptap.dev/)** for the editor, built on ProseMirror.
* **[Zustand](https://github.com/pmndrs/zustand)** for state, with granular selectors to keep renders during typing cheap.
* **[Tailwind CSS](https://tailwindcss.com/)** for styling.
* **[marked](https://marked.js.org/)** and **[Turndown](https://github.com/mixmark-io/turndown)** for the Markdown and HTML bridge, with DOMPurify sanitization on input.
* **[Vite](https://vitejs.dev/)** for the build.
* **Rust** for native spellcheck, using Levenshtein distance and accent aware suggestions over a 312k word Portuguese dictionary.

## Development

### Requirements

* [Node.js](https://nodejs.org/) 20+
* [Rust toolchain](https://www.rust-lang.org/tools/install) stable
* Platform specific build dependencies for Tauri. See [Tauri's prerequisites](https://tauri.app/start/prerequisites/)

### Run locally

```bash
git clone https://github.com/aornueos/solon.git
cd solon
npm install
npm run tauri dev
```

`npm run dev` alone starts the Vite dev server in the browser. Most filesystem features will not work there because there is no `__TAURI_INTERNALS__`, but it is useful for UI iteration.

### Build

```bash
npm run build
npm run tauri build
```

### Other scripts

```bash
npm run version:set <X.Y.Z|patch|minor|major>
npm run release:prepare
npm run brand:icons
npm run test:robustness
npm run kill
```

## Configuration

Most behavior is configured from `Settings` with `Ctrl+,`.

Per project files Solon reads:

* **`.solon/snippets.json`** stores snippet definitions in the format `{ ";trigger": "replacement", ... }`. Custom triggers must start with `;`.
* **`.solon/order.json`** stores manual sidebar ordering.
* **`.solon/history/<file>/`** stores local snapshots managed by the app.

User preferences live in `localStorage` and follow the `solon:*` key prefix.

## Roadmap

Likely to come:

* macOS and Linux release builds.
* DOCX export with Shunn manuscript format for submission.
* Authenticode signature for the Windows installer.
* Collapsible headings inside the editor.
* Aliased wikilinks with `[[file|display name]]`.

Deliberately out of scope:

* Knowledge graph view for wikilinks.
* Daily notes.
* Templated pages.
* Plugins.
* Productivity tracking with streaks, session timers, or heatmaps.
* Real time collaboration. Solon is single author by design.

## Contributing

This is a personal project. Issues and pull requests are welcome, but they are treated case by case. Please open an issue describing the change before opening a PR.

### Code style

* TypeScript with strict mode. `tsc --noEmit` must pass.
* Comments explain **why**, not what.
* Performance matters because the editor runs at typing speed. Subscriptions to the Zustand store should select primitives or stable refs only. Broad `useAppStore()` calls in hot components will re render the world.
* Filesystem operations must use `lib/atomicWrite.ts`.
* Paths must pass `assertInsideProject` from `lib/pathSecurity.ts`.

## License

To be defined. Until then, source is available for personal use and study.
