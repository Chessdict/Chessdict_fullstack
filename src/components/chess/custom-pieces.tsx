const PIECE_CODES = ["K", "Q", "R", "B", "N", "P"] as const;
const PIECE_SCALE = 1.13;

type PieceCode = `w${typeof PIECE_CODES[number]}` | `b${typeof PIECE_CODES[number]}`;

type PieceProps = {
  fill?: string;
  square?: string;
  svgStyle?: React.CSSProperties;
};

const PIECE_LAYOUT: Record<string, { width: string; height: string }> = {
  P: { width: "49%", height: "70%" },
  R: { width: "68%", height: "72%" },
  N: { width: "74%", height: "74%" },
  B: { width: "74%", height: "76%" },
  Q: { width: "76%", height: "74%" },
  K: { width: "74%", height: "78%" },
  default: { width: "74%", height: "74%" },
};

function renderPiece(code: PieceCode, props?: PieceProps) {
  const pieceType = code[1];
  const layout = PIECE_LAYOUT[pieceType] ?? PIECE_LAYOUT.default;

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
          display: "grid",
          placeItems: "center",
          transform: `scale(${PIECE_SCALE})`,
          transformOrigin: "center",
        }}
      >
        <img
          src={`/pieces/${code}.svg`}
          alt={code}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "contain",
            objectPosition: "center",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      </div>
    </div>
  );
}

export const customPieces: Record<string, (props?: PieceProps) => React.JSX.Element> = {};

for (const code of PIECE_CODES) {
  customPieces[`w${code}`] = (props) => renderPiece(`w${code}`, props);
  customPieces[`b${code}`] = (props) => renderPiece(`b${code}`, props);
}
