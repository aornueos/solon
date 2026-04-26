import { useRef, useState, useEffect } from "react";
import { CanvasCard, CARD_COLORS, CardSide } from "../../types/canvas";
import { SCENE_STATUSES } from "../../types/scene";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useAppStore } from "../../store/useAppStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { startDrag } from "../../lib/drag";
import { Link2, Trash2, Palette, FileText, MapPin, Clock, User } from "lucide-react";
import clsx from "clsx";

interface Props {
  card: CanvasCard;
}

export function Card({ card }: Props) {
  const {
    updateCard,
    removeCard,
    bringToFront,
    select,
    selectedId,
    selectedIds,
    linkingFromId,
    linkingFromSide,
    beginLink,
    completeLink,
    cancelLink,
    snapshotSelection,
    translateSelection,
    viewport,
    tool,
    pushHistory,
  } = useCanvasStore();

  const setActiveView = useAppStore((s) => s.setActiveView);
  const { openFile } = useFileSystem();

  const isScene = card.kind === "scene";
  const isSelected = selectedId === card.id;
  const isInGroup = selectedId !== card.id && selectedIds.has(card.id);
  const isLinkSource = linkingFromId === card.id;
  const isLinkCandidate = linkingFromId !== null && linkingFromId !== card.id;

  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const openInEditor = () => {
    if (!isScene || !card.scenePath) return;
    // Deriva o nome real do arquivo a partir do path — funciona para .md, .txt
    // e sobrevive a renames (scenePath é atualizado por rewireScenePath).
    const fileName = card.scenePath.split(/[\\/]/).pop() ?? card.text;
    openFile(card.scenePath, fileName);
    setActiveView("editor");
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (editing) return;
    const target = e.target as HTMLElement;

    // Arrow mode tem prioridade sobre todos os guards: clicar em QUALQUER
    // pedaço do card (inclusive barra de ações, handle de resize, overlay
    // de "action area") deve iniciar ou completar o link. Antes, a barra
    // de ações — com `opacity-0 group-hover:opacity-100` ocupando 28px
    // acima do card — interceptava o clique e o usuário via "a seta só
    // aparece em partes específicas do card".
    if (tool === "arrow") {
      if (target.tagName === "TEXTAREA") return;
      e.stopPropagation();
      e.preventDefault();
      if (linkingFromId) completeLink(card.id);
      else beginLink(card.id);
      return;
    }

    // Borracha: clicar em qualquer parte do card o apaga (incluindo
    // arrows conectadas — `removeCard` ja faz cascade na store).
    if (tool === "eraser") {
      if (target.tagName === "TEXTAREA") return;
      e.stopPropagation();
      e.preventDefault();
      removeCard(card.id);
      return;
    }

    if (target.closest("[data-card-action]")) return;
    if (target.tagName === "TEXTAREA") return;

    // Em draw/text mode, deixa o evento borbulhar pro bg.
    if (tool !== "select" && !linkingFromId) return;

    e.stopPropagation();

    if (linkingFromId) {
      bringToFront(card.id);
      completeLink(card.id);
      return;
    }

    // Group drag: se este card ja pertence a uma selecao multipla,
    // preserva o grupo e translada todos juntos. Se nao, reduz a
    // selecao a este card (comportamento classico de single-drag).
    //
    // Detecta _antes_ de chamar `select`, pq select() reescreveria
    // selectedIds pra {card.id} e perderiamos a referencia ao grupo.
    const currentIds = useCanvasStore.getState().selectedIds;
    const isGroupDrag = currentIds.size > 1 && currentIds.has(card.id);

    if (isGroupDrag) {
      // Snapshot das posicoes originais de TODOS os itens do grupo.
      const snapshot = snapshotSelection();
      const orig = { startX: e.clientX, startY: e.clientY };
      // History push antes do drag — Ctrl+Z volta a posicao do grupo
      // inteira pre-drag de uma vez.
      pushHistory();
      // NAO chamamos select() aqui — preservamos selectedId/selectedIds
      // como estavam. Tambem NAO chamamos bringToFront pra preservar a
      // z-order relativa dos itens do grupo.
      dragState.current = { startX: orig.startX, startY: orig.startY, origX: card.x, origY: card.y };
      startDrag({
        onMove: (ev) => {
          const dx = (ev.clientX - orig.startX) / viewport.zoom;
          const dy = (ev.clientY - orig.startY) / viewport.zoom;
          translateSelection(snapshot, dx, dy);
        },
        onEnd: () => {
          dragState.current = null;
        },
        onCancel: () => {
          dragState.current = null;
          translateSelection(snapshot, 0, 0);
        },
      });
      return;
    }

    // Single-drag path
    bringToFront(card.id);
    select(card.id);
    pushHistory();

    const orig = {
      startX: e.clientX,
      startY: e.clientY,
      origX: card.x,
      origY: card.y,
    };
    dragState.current = orig;

    startDrag({
      onMove: (ev) => {
        if (!dragState.current) return;
        const dx = (ev.clientX - orig.startX) / viewport.zoom;
        const dy = (ev.clientY - orig.startY) / viewport.zoom;
        updateCard(card.id, { x: orig.origX + dx, y: orig.origY + dy });
      },
      onEnd: () => {
        dragState.current = null;
      },
      onCancel: () => {
        // Blur/Esc durante o drag: devolve o card pra posição original pra
        // não deixar o usuário com "arrastou um pouco e sumiu de vista".
        dragState.current = null;
        updateCard(card.id, { x: orig.origX, y: orig.origY });
      },
    });
  };

  // Fecha paleta ao clicar fora
  useEffect(() => {
    if (!showPalette) return;
    const onClick = () => setShowPalette(false);
    const id = window.setTimeout(
      () => document.addEventListener("click", onClick, { once: true }),
      0,
    );
    return () => window.clearTimeout(id);
  }, [showPalette]);

  // Cor de fundo do card: se o usuário escolheu uma custom na paleta
  // (CARD_COLORS tem hex fixos, sépia-friendly), respeitamos. Sem custom,
  // cai no `--bg-panel` do tema — garante que cards default no dark tema
  // fiquem no grafite e não no sépia claro original.
  const color = card.color ?? "var(--bg-panel)";
  // Quando o card tem fundo pastel custom (todos CARD_COLORS sao tons claros
  // — sepia, ambar, verde, rosa, azul, lavanda), o texto interno PRECISA
  // ser escuro pra contrastar — independente do tema da app. Sem isso, no
  // dark theme `--text-primary` vira clarinho e some no fundo pastel.
  // Tons: #1f1e1c (mesmo do --text-primary do light theme).
  const hasCustomBg = !!card.color;
  const innerTextColor = hasCustomBg ? "#1f1e1c" : "var(--text-primary)";
  const innerSecondaryColor = hasCustomBg ? "#5e5a52" : "var(--text-secondary)";
  const innerPlaceholderColor = hasCustomBg ? "#9a9489" : "var(--text-placeholder)";
  const innerMutedColor = hasCustomBg ? "#7a766d" : "var(--text-muted)";
  const sceneStatus = isScene
    ? SCENE_STATUSES.find((s) => s.value === card.scene?.status)
    : undefined;
  const statusBorder = sceneStatus?.color ?? "var(--border)";

  // Ring de estado: ring do Tailwind injeta cor via `--tw-ring-color`,
  // mas usar Tailwind arbitrary com `ring-[#hex]` não respeita theme.
  // Composed aqui em runtime — 2px solid + offset simulado via outline.
  const ringStyle: React.CSSProperties = isLinkSource
    ? { boxShadow: "0 0 0 2px var(--accent-2)" }
    : isLinkCandidate
    ? { boxShadow: "0 0 0 2px var(--success)" }
    : isInGroup
    ? { boxShadow: "0 0 0 2px var(--selection-ring)" }
    : {};

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => {
        if (tool !== "select") return;
        e.stopPropagation();
        if (isScene) openInEditor();
        else setEditing(true);
      }}
      style={{
        position: "absolute",
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        background: color,
        borderLeft: isScene ? `4px solid ${statusBorder}` : undefined,
        borderColor: isSelected ? "var(--accent)" : "var(--border)",
        boxShadow: isSelected ? "var(--shadow-md)" : "var(--shadow-sm)",
        ...ringStyle,
      }}
      className={clsx(
        "rounded-md border transition-shadow group",
        linkingFromId || tool === "arrow"
          ? "cursor-crosshair"
          : tool === "eraser"
          ? "cursor-cell"
          : "cursor-grab active:cursor-grabbing",
      )}
      title={isScene ? "Duplo clique para abrir a cena no editor" : undefined}
    >
      {/* Conteúdo */}
      <div className="w-full h-full p-2.5 overflow-hidden flex flex-col">
        {isScene ? (
          <SceneBody
            card={card}
            innerTextColor={innerTextColor}
            innerSecondaryColor={innerSecondaryColor}
            innerPlaceholderColor={innerPlaceholderColor}
            innerMutedColor={innerMutedColor}
          />
        ) : editing ? (
          <textarea
            autoFocus
            value={card.text}
            onChange={(e) => updateCard(card.id, { text: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Digite…"
            className="flex-1 w-full resize-none bg-transparent outline-none text-[0.82rem] font-serif leading-relaxed"
            style={{ color: innerTextColor }}
          />
        ) : (
          <div
            className="flex-1 w-full overflow-hidden text-[0.82rem] font-serif leading-relaxed whitespace-pre-wrap"
            style={{ color: innerTextColor }}
          >
            {card.text || (
              <span
                className="italic"
                style={{ color: innerPlaceholderColor }}
              >
                (duplo clique p/ editar)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Barra de ações (visível no hover/selected) */}
      <div
        data-card-action
        className={clsx(
          "absolute -top-7 left-0 right-0 flex items-center gap-0.5 px-1",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          "transition-opacity",
        )}
      >
        <ActionBtn
          title={
            isLinkCandidate
              ? "Conectar neste card"
              : isLinkSource
              ? "Cancelar conexão"
              : "Conectar a outro card"
          }
          onClick={(e) => {
            e.stopPropagation();
            // Se há linking ativo, este botão completa a conexão quando
            // clicado num card diferente do de origem. Antes ele só chamava
            // beginLink, o que fazia usuário "clicar e não acontecer nada"
            // quando partia do Link2 para conectar via barra de ações.
            if (linkingFromId && linkingFromId !== card.id) {
              completeLink(card.id);
            } else if (linkingFromId === card.id) {
              // Clicar no próprio card de origem cancela o linking.
              cancelLink();
            } else {
              beginLink(card.id);
            }
          }}
          active={isLinkSource}
        >
          <Link2 size={11} />
        </ActionBtn>
        {!isScene && (
          <ActionBtn
            title="Cor"
            onClick={(e) => {
              e.stopPropagation();
              setShowPalette((v) => !v);
            }}
          >
            <Palette size={11} />
          </ActionBtn>
        )}
        {isScene && (
          <ActionBtn
            title="Abrir no editor"
            onClick={(e) => {
              e.stopPropagation();
              openInEditor();
            }}
          >
            <FileText size={11} />
          </ActionBtn>
        )}
        <div className="flex-1" />
        <ActionBtn
          title="Excluir"
          danger
          onClick={(e) => {
            e.stopPropagation();
            removeCard(card.id);
          }}
        >
          <Trash2 size={11} />
        </ActionBtn>
      </div>

      {/* Paleta */}
      {showPalette && (
        <div
          data-card-action
          className="absolute -top-7 left-14 flex gap-1 rounded px-1.5 py-1 z-10"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {CARD_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={(e) => {
                e.stopPropagation();
                updateCard(card.id, { color: c.value });
                setShowPalette(false);
              }}
              style={{
                background: c.value,
                border: "1px solid var(--border)",
              }}
              className="w-4 h-4 rounded-full hover:scale-110 transition-transform"
            />
          ))}
        </div>
      )}

      {/* Pontos de conexão (4 lados) — clique inicia/completa linking
          com lado explícito. Visíveis no hover do card, sempre durante
          linking, e quando o card está selecionado.
          Em modo eraser ficam escondidos: o stopPropagation deles comeria
          o click e o card nao seria apagado, dando a sensacao de "borracha
          nao funciona em alguns pontos do card". */}
      {tool !== "eraser" && (
        <ConnectionDots
          isLinkSource={isLinkSource}
          isLinkCandidate={isLinkCandidate}
          linkingFromSide={linkingFromSide}
          isSelected={isSelected}
          onPick={(side) => {
            if (linkingFromId && linkingFromId !== card.id) {
              completeLink(card.id, side);
            } else {
              // Sem linking em progresso OU estou no próprio card de origem
              // (re-escolher o lado de saída). beginLink com mesmo id só
              // atualiza o `linkingFromSide`.
              beginLink(card.id, side);
            }
          }}
        />
      )}

      {/* Handle de resize (canto inf-dir). Tambem escondido em eraser
          pelo mesmo motivo dos ConnectionDots. */}
      {tool !== "eraser" && <ResizeHandle card={card} />}
    </div>
  );
}

function ConnectionDots({
  isLinkSource,
  isLinkCandidate,
  linkingFromSide,
  isSelected,
  onPick,
}: {
  isLinkSource: boolean;
  isLinkCandidate: boolean;
  linkingFromSide: CardSide | null;
  isSelected: boolean;
  onPick: (side: CardSide) => void;
}) {
  // Posicionamento em CSS: cada dot fica centrado no midpoint do seu lado,
  // usando translate(-50%,-50%) pra o centro do círculo coincidir com a
  // borda do card. Assim o dot "monta" a borda como num Miro clássico.
  const sides: {
    side: CardSide;
    style: React.CSSProperties;
    title: string;
  }[] = [
    {
      side: "top",
      style: { top: 0, left: "50%", transform: "translate(-50%, -50%)" },
      title: "Conectar pelo topo",
    },
    {
      side: "right",
      style: { top: "50%", left: "100%", transform: "translate(-50%, -50%)" },
      title: "Conectar pela direita",
    },
    {
      side: "bottom",
      style: { top: "100%", left: "50%", transform: "translate(-50%, -50%)" },
      title: "Conectar pela base",
    },
    {
      side: "left",
      style: { top: "50%", left: 0, transform: "translate(-50%, -50%)" },
      title: "Conectar pela esquerda",
    },
  ];

  // Durante linking todos os dots de candidatos ficam visíveis (afford de
  // drop target). Fora de linking só aparecem no hover/selected pra não
  // poluir o canvas.
  const alwaysShow = isLinkSource || isLinkCandidate || isSelected;

  return (
    <>
      {sides.map(({ side, style, title }) => {
        // Destaca o dot que está sendo usado como lado de origem
        const activeSource = isLinkSource && linkingFromSide === side;
        return (
          <button
            key={side}
            data-card-action
            title={title}
            onMouseDown={(e) => {
              // stopPropagation garante que o onMouseDown do card pai não
              // dispare (evita iniciar drag do card ou auto-link por clique
              // no body). preventDefault evita text-select em arrasto.
              e.stopPropagation();
              e.preventDefault();
              onPick(side);
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={clsx(
              "absolute w-3 h-3 rounded-full transition-opacity",
              alwaysShow ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{
              ...style,
              background: activeSource ? "var(--accent)" : "var(--bg-panel)",
              border: "2px solid var(--accent)",
              cursor: "crosshair",
              // zIndex acima do resize handle e da barra de ações
              zIndex: 5,
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }}
          />
        );
      })}
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const { bg, fg, bd } = (() => {
    if (active) {
      return {
        bg: "var(--accent-2)",
        fg: "var(--text-inverse)",
        bd: "var(--accent-2)",
      };
    }
    if (hovered && danger) {
      return {
        bg: "var(--danger)",
        fg: "var(--text-inverse)",
        bd: "var(--danger)",
      };
    }
    if (hovered) {
      return {
        bg: "var(--bg-hover)",
        fg: "var(--text-secondary)",
        bd: "var(--border)",
      };
    }
    return {
      bg: "var(--bg-panel)",
      fg: "var(--text-muted)",
      bd: "var(--border)",
    };
  })();
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="p-1 rounded transition-colors"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${bd}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </button>
  );
}

function SceneBody({
  card,
  innerTextColor,
  innerSecondaryColor,
  innerPlaceholderColor,
  innerMutedColor,
}: {
  card: CanvasCard;
  innerTextColor: string;
  innerSecondaryColor: string;
  innerPlaceholderColor: string;
  innerMutedColor: string;
}) {
  const scene = card.scene;
  const status = SCENE_STATUSES.find((s) => s.value === scene?.status);
  const title = scene?.title ?? card.text;
  const orphan = !scene; // arquivo removido / não lido

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-1">
      {/* Header: título + status pill */}
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex-1 font-serif font-semibold text-[0.92rem] leading-snug truncate"
          style={{ color: innerTextColor }}
          title={title}
        >
          {title || (
            <span
              className="italic"
              style={{ color: innerPlaceholderColor }}
            >
              (sem título)
            </span>
          )}
        </div>
        {status && (
          <span
            className="flex-shrink-0 text-[0.58rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${status.color}22`, color: status.color }}
          >
            {status.label}
          </span>
        )}
      </div>

      {/* Meta: POV · local · tempo */}
      {scene && (scene.pov || scene.location || scene.time) && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem]"
          style={{ color: innerMutedColor }}
        >
          {scene.pov && (
            <MetaItem
              icon={<User size={9} />}
              text={scene.pov}
              iconColor={innerPlaceholderColor}
            />
          )}
          {scene.location && (
            <MetaItem
              icon={<MapPin size={9} />}
              text={scene.location}
              iconColor={innerPlaceholderColor}
            />
          )}
          {scene.time && (
            <MetaItem
              icon={<Clock size={9} />}
              text={scene.time}
              iconColor={innerPlaceholderColor}
            />
          )}
        </div>
      )}

      {/* Sinopse / corpo */}
      <div
        className="flex-1 min-h-0 overflow-hidden text-[0.76rem] font-serif leading-relaxed"
        style={{ color: innerSecondaryColor }}
      >
        {orphan ? (
          <span className="italic" style={{ color: "var(--danger)" }}>
            Arquivo não encontrado — renomeado ou removido.
          </span>
        ) : scene?.synopsis ? (
          <p className="line-clamp-4">{scene.synopsis}</p>
        ) : (
          <span
            className="italic"
            style={{ color: innerPlaceholderColor }}
          >
            Sem sinopse. Duplo clique para abrir e escrever.
          </span>
        )}
      </div>
    </div>
  );
}

function MetaItem({
  icon,
  text,
  iconColor,
}: {
  icon: React.ReactNode;
  text: string;
  iconColor: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 max-w-[50%] truncate">
      <span className="flex-shrink-0" style={{ color: iconColor }}>
        {icon}
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}

function ResizeHandle({ card }: { card: CanvasCard }) {
  const { updateCard, viewport } = useCanvasStore();
  const onDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = card.w;
    const origH = card.h;
    startDrag({
      onMove: (ev) => {
        const dw = (ev.clientX - startX) / viewport.zoom;
        const dh = (ev.clientY - startY) / viewport.zoom;
        updateCard(card.id, {
          w: Math.max(120, origW + dw),
          h: Math.max(60, origH + dh),
        });
      },
      onCancel: () => {
        // Reverte se a janela perder foco durante o resize
        updateCard(card.id, { w: origW, h: origH });
      },
    });
  };
  return (
    <div
      data-card-action
      onMouseDown={onDown}
      className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100"
      style={{
        // Hachura diagonal 2px usando `border-strong` pro hint visual.
        // No dark tema o tom é cinza claro; no light é cinza-sépia.
        background:
          "repeating-linear-gradient(135deg, var(--border-strong) 0 2px, transparent 2px 4px)",
      }}
    />
  );
}
