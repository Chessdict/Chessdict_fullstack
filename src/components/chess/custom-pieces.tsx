import { useId, useMemo } from "react";

import { CUSTOM_PIECE_SVGS } from "./custom-piece-svg-map";

const PIECE_CODES = ["K", "Q", "R", "B", "N", "P"] as const;

type PieceCode = `w${typeof PIECE_CODES[number]}` | `b${typeof PIECE_CODES[number]}`;

type PieceProps = {
  fill?: string;
  square?: string;
  svgStyle?: React.CSSProperties;
};

const PREPARED_CUSTOM_PIECE_SVGS = Object.fromEntries(
  Object.entries(CUSTOM_PIECE_SVGS).map(([code, svg]) => [
    code,
    svg.replace(
      "<svg ",
      '<svg preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;overflow:visible" ',
    ),
  ]),
) as Record<PieceCode, string>;

const PIECE_LAYOUT: Record<string, { width: string; height: string }> = {
  P: { width: "60%", height: "85%" },
  R: { width: "80%", height: "84%" },
  N: { width: "88%", height: "88%" },
  B: { width: "88%", height: "90%" },
  Q: { width: "90%", height: "88%" },
  K: { width: "88%", height: "92%" },
  default: { width: "88%", height: "88%" },
};

function namespaceSvgMarkup(svgMarkup: string, prefix: string) {
  const idMap = new Map<string, string>();

  const withScopedIds = svgMarkup.replace(/\sid="([^"]+)"/g, (fullMatch, idValue) => {
    const scopedId = `${prefix}-${idValue}`;
    idMap.set(idValue, scopedId);
    return fullMatch.replace(`"${idValue}"`, `"${scopedId}"`);
  });

  const replaceIdReference = (_fullMatch: string, idValue: string) => {
    const scopedId = idMap.get(idValue) ?? `${prefix}-${idValue}`;
    return `url(#${scopedId})`;
  };

  const replaceHrefReference = (attribute: "href" | "xlink:href") =>
    new RegExp(`${attribute}="#([^"]+)"`, "g");

  return withScopedIds
    .replace(/url\(#([^)]+)\)/g, replaceIdReference)
    .replace(replaceHrefReference("xlink:href"), (_fullMatch, idValue) => {
      const scopedId = idMap.get(idValue) ?? `${prefix}-${idValue}`;
      return `xlink:href="#${scopedId}"`;
    })
    .replace(replaceHrefReference("href"), (_fullMatch, idValue) => {
      const scopedId = idMap.get(idValue) ?? `${prefix}-${idValue}`;
      return `href="#${scopedId}"`;
    });
}

function CustomPieceRenderer({
  code,
  props,
}: {
  code: PieceCode;
  props?: PieceProps;
}) {
  const pieceInstanceId = useId().replace(/[:]/g, "");
  const pieceType = code[1];
  const layout = PIECE_LAYOUT[pieceType] ?? PIECE_LAYOUT.default;
  const svgMarkup = useMemo(
    () => namespaceSvgMarkup(PREPARED_CUSTOM_PIECE_SVGS[code], `${code}-${pieceInstanceId}`),
    [code, pieceInstanceId],
  );

  return (
    <div
      style={{
        ...props?.svgStyle,
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        lineHeight: 0,
        overflow: "visible",
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
          overflow: "visible",
        }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    </div>
  );
}

export const customPieces: Record<string, (props?: PieceProps) => React.JSX.Element> = {};

for (const code of PIECE_CODES) {
  customPieces[`w${code}`] = (props) =>
    (
      <CustomPieceRenderer
        code={`w${code}`}
        props={{
          ...props,
          svgStyle: {
            ...props?.svgStyle,
          },
        }}
      />
    );
  customPieces[`b${code}`] = (props) =>
    (
      <CustomPieceRenderer
        code={`b${code}`}
        props={{
          ...props,
          svgStyle: {
            ...props?.svgStyle,
          },
        }}
      />
    );
}
