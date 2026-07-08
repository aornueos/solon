import clsx from "clsx";
import { CardSide } from "../../types/canvas";
import { useCanvasStore } from "../../store/useCanvasStore";
import { startCanvasLinkDrag } from "../../lib/canvasLinkDrag";

/**
 * Posicoes dos dots — FORA da caixa (nao mais em cima da borda). Antes o
 * centro do dot ficava EXATAMENTE na borda (top:0/left:50%/etc + translate
 * -50%/-50%), o que colocava metade do dot sobre a caixa e, em itens
 * pequenos, fazia o dot colidir/sobrepor os handles de resize dos cantos —
 * dificil de clicar no alvo certo. Com `gap` o dot fica inteiramente fora,
 * sem disputar espaco com resize.
 */
function buildSides(
  gap: number,
): { side: CardSide; style: React.CSSProperties; title: string }[] {
  return [
    {
      side: "top",
      style: { top: -gap, left: "50%", transform: "translate(-50%, -50%)" },
      title: "Conectar pelo topo",
    },
    {
      side: "right",
      style: {
        top: "50%",
        left: `calc(100% + ${gap}px)`,
        transform: "translate(-50%, -50%)",
      },
      title: "Conectar pela direita",
    },
    {
      side: "bottom",
      style: {
        top: `calc(100% + ${gap}px)`,
        left: "50%",
        transform: "translate(-50%, -50%)",
      },
      title: "Conectar pela base",
    },
    {
      side: "left",
      style: { top: "50%", left: -gap, transform: "translate(-50%, -50%)" },
      title: "Conectar pela esquerda",
    },
  ];
}

export function ConnectionDots({
  entityId,
  isLinkSource,
  linkingFromSide,
  onPick,
}: {
  entityId: string;
  isLinkSource: boolean;
  isLinkCandidate: boolean;
  linkingFromSide: CardSide | null;
  isSelected: boolean;
  onPick: (side: CardSide) => void;
}) {
  // So' a ORIGEM do link mantem os dots fixos. Candidatos (todos os outros
  // itens durante um linking) e itens meramente selecionados mostram os dots
  // apenas no HOVER — senao, com cards/linhas empilhados, os 4 dots de cada
  // um aparecem juntos e viram uma sopa de bolinhas. Estilo Miro: voce passa
  // o mouse no alvo e os pontos de conexao dele surgem.
  const alwaysShow = isLinkSource;
  const zoom = useCanvasStore((s) => s.viewport.zoom || 1);
  const dotSize = 10 / zoom;
  const border = 1.8 / zoom;
  const mask = 1.5 / zoom;
  // Distancia do dot ate' a borda — fora da caixa, sem disputar espaco com
  // os handles de resize dos cantos.
  const gap = 8 / zoom;
  const sides = buildSides(gap);

  return (
    <>
      {sides.map(({ side, style, title }) => {
        const activeSource = isLinkSource && linkingFromSide === side;
        return (
          <button
            key={side}
            data-connection-dot
            data-card-action
            data-text-action
            data-image-action
            data-connection-side={side}
            title={title}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPick(side);
              startCanvasLinkDrag(entityId, e);
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={clsx(
              "absolute rounded-full transition-opacity",
              alwaysShow ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{
              ...style,
              width: dotSize,
              height: dotSize,
              background: activeSource ? "var(--accent)" : "var(--bg-panel)",
              border: `${border}px solid var(--accent)`,
              cursor: "crosshair",
              zIndex: 40,
              boxShadow: `0 0 0 ${mask}px var(--bg-app), 0 ${1 / zoom}px ${2 / zoom}px rgba(0,0,0,0.18)`,
            }}
          />
        );
      })}
    </>
  );
}
