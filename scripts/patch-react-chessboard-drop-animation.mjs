import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const targetFiles = [
  "node_modules/react-chessboard/dist/index.esm.js",
  "node_modules/react-chessboard/dist/index.js",
];

const contextNeedle =
  "const { allowDragOffBoard, board, boardStyle, chessboardColumns, currentPosition, draggingPiece, id, } = useChessboardContext();";
const patchedContextNeedle =
  "const { allowDragOffBoard, animationDurationInMs, board, boardStyle, chessboardColumns, currentPosition, draggingPiece, id, } = useChessboardContext();";
const dropAnimationNeedle = "dropAnimation: null, modifiers: [";
const patchedDropAnimationNeedle =
  "dropAnimation: { duration: animationDurationInMs, easing: 'ease' }, modifiers: [";

for (const relativePath of targetFiles) {
  const filePath = path.resolve(process.cwd(), relativePath);

  if (!existsSync(filePath)) {
    throw new Error(`react-chessboard patch target not found: ${relativePath}`);
  }

  let source = readFileSync(filePath, "utf8");
  let changed = false;

  if (!source.includes(patchedContextNeedle)) {
    if (!source.includes(contextNeedle)) {
      throw new Error(`react-chessboard board context signature changed in ${relativePath}`);
    }

    source = source.replace(contextNeedle, patchedContextNeedle);
    changed = true;
  }

  if (!source.includes(patchedDropAnimationNeedle)) {
    if (!source.includes(dropAnimationNeedle)) {
      throw new Error(`react-chessboard drop animation signature changed in ${relativePath}`);
    }

    source = source.replace(dropAnimationNeedle, patchedDropAnimationNeedle);
    changed = true;
  }

  if (changed) {
    writeFileSync(filePath, source);
    console.log(`Patched ${relativePath}`);
  } else {
    console.log(`Already patched ${relativePath}`);
  }
}
