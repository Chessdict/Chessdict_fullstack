import { CUSTOM_PIECE_SVGS } from "./custom-piece-svg-map";

const PIECE_CODES = ["K", "Q", "R", "B", "N", "P"] as const;

type PieceCode = `w${typeof PIECE_CODES[number]}` | `b${typeof PIECE_CODES[number]}`;

type PieceProps = {
  fill?: string;
  square?: string;
  svgStyle?: React.CSSProperties;
};

const PIECE_LAYOUT: Record<string, { width: string; height: string }> = {
  P: { width: "60%", height: "85%" },
  R: { width: "77%", height: "81%" },
  N: { width: "84%", height: "84%" },
  B: { width: "84%", height: "86%" },
  Q: { width: "86%", height: "84%" },
  K: { width: "84%", height: "88%" },
  default: { width: "84%", height: "84%" },
};

function renderPiece(code: PieceCode, props?: PieceProps) {
  const pieceType = code[1];
  const layout = PIECE_LAYOUT[pieceType] ?? PIECE_LAYOUT.default;
  const svgMarkup = CUSTOM_PIECE_SVGS[code];

  return (
    <div
      style={{
        ...props?.svgStyle,
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        lineHeight: 0,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: layout.width,
          height: layout.height,
          display: "block",
          lineHeight: 0,
        }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    </div>
  );
}

export const customPieces: Record<string, (props?: PieceProps) => React.JSX.Element> = {};

for (const code of PIECE_CODES) {
  customPieces[`w${code}`] = (props) =>
    renderPiece(`w${code}`, {
      ...props,
      svgStyle: {
        ...props?.svgStyle,
      },
    });
  customPieces[`b${code}`] = (props) =>
    renderPiece(`b${code}`, {
      ...props,
      svgStyle: {
        ...props?.svgStyle,
      },
    });
}
