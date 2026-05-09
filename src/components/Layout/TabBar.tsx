import { X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import clsx from "clsx";

/**
 * Barra de abas dos arquivos abertos. Aparece entre Titlebar e o conteudo
 * (editor/canvas) sempre que ha 1+ aba aberta — ate' com 1 so aba ja'
 * mostra (consistencia + feedback visual de qual arquivo esta ativo).
 *
 * Comportamento:
 *  - Click no rotulo: ativa a aba (chama openFile do path).
 *  - Click no ✕: fecha a aba. Se era a ativa, ativa a vizinha (proxima ou
 *    anterior) automaticamente.
 *  - Click do meio (button=1): fecha (convencao de browser).
 *  - Indicador `●` antes do nome quando ha edits nao salvos no arquivo
 *    ATIVO (saveStatus dirty/saving). Abas inativas nao tem buffer em
 *    memoria, entao sao sempre "limpas" do ponto de vista da UI.
 *
 * O auto-save ja' flusha o buffer da aba anterior quando `activeFilePath`
 * muda (via subscribe em useAutoSave), entao trocar de aba e' seguro
 * mesmo com edits pendentes.
 */
export function TabBar() {
  const tabs = useAppStore((s) => s.openTabs);
  const activePath = useAppStore((s) => s.activeFilePath);
  const saveStatus = useAppStore((s) => s.saveStatus);
  const closeTab = useAppStore((s) => s.closeTab);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { openFile } = useFileSystem();

  if (tabs.length === 0) return null;

  const onActivate = (path: string, name: string) => {
    if (path === activePath) return;
    void openFile(path, name);
    // Garante que sair da home/canvas pra editor — o user pode ter clicado
    // numa aba enquanto estava no canvas; a expectativa e' "abrir o arquivo".
    const view = useAppStore.getState().activeView;
    if (view === "home") setActiveView("editor");
  };

  const onClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const next = closeTab(path);
    // Se a aba fechada era a ativa, abre a vizinha. Se nao havia vizinha,
    // limpa o arquivo ativo — mesma logica do deleteNode quando o arquivo
    // ativo e' apagado.
    if (path === activePath) {
      if (next) {
        const tab = useAppStore.getState().openTabs.find((t) => t.path === next);
        if (tab) void openFile(tab.path, tab.name);
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
  };

  return (
    <div
      className="flex items-stretch overflow-x-auto flex-shrink-0"
      style={{
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border-subtle)",
        // Scrollbar discreta — abas em excesso rolam horizontalmente.
        scrollbarWidth: "thin",
      }}
      role="tablist"
      aria-label="Arquivos abertos"
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        const isDirty =
          isActive && (saveStatus === "dirty" || saveStatus === "saving");
        return (
          <Tab
            key={tab.path}
            name={tab.name}
            isActive={isActive}
            isDirty={isDirty}
            onClick={() => onActivate(tab.path, tab.name)}
            onMiddleClick={(e) => onClose(e, tab.path)}
            onClose={(e) => onClose(e, tab.path)}
          />
        );
      })}
    </div>
  );
}

function Tab({
  name,
  isActive,
  isDirty,
  onClick,
  onMiddleClick,
  onClose,
}: {
  name: string;
  isActive: boolean;
  isDirty: boolean;
  onClick: () => void;
  onMiddleClick: (e: React.MouseEvent) => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      onAuxClick={(e) => {
        // button=1 e' middle-click (convencao de browser pra fechar aba).
        if (e.button === 1) onMiddleClick(e);
      }}
      className={clsx(
        "group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer flex-shrink-0",
        "text-[0.78rem] transition-colors select-none",
      )}
      style={{
        background: isActive ? "var(--bg-app)" : "transparent",
        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
        // Aba ativa "destaca" do fundo da TabBar com a cor do conteudo
        // (bg-app), criando a sensacao classica de "esta aba e' o documento
        // visivel atras". Borda inferior some na ativa pra emendar com o
        // editor/canvas; nas outras fica a borda da TabBar.
        borderRight: "1px solid var(--border-subtle)",
        borderBottom: isActive
          ? "1px solid var(--bg-app)"
          : "1px solid transparent",
        marginBottom: "-1px",
        maxWidth: 220,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
      title={name}
    >
      {/* Indicador de dirty: ● substitui o ✕ quando ha edits pendentes na
          aba ativa. No hover, o ✕ aparece por cima pra permitir fechar
          mesmo com pending — auto-save flusha antes de a aba sumir. */}
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={onClose}
        className={clsx(
          "ml-1 flex-shrink-0 rounded p-0.5 transition-opacity",
          isActive || isDirty ? "opacity-60" : "opacity-0 group-hover:opacity-60",
        )}
        style={{
          color: "var(--text-muted)",
          width: 16,
          height: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "1";
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity =
            isActive || isDirty ? "0.6" : "0";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        aria-label={`Fechar ${name}`}
        title="Fechar (Ctrl+W)"
      >
        {isDirty ? (
          <span
            className="block rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "var(--text-secondary)",
            }}
          />
        ) : (
          <X size={11} />
        )}
      </button>
    </div>
  );
}
