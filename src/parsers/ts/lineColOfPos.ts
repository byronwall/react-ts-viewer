import { type Position } from "../../types";

import type * as ts from "typescript";


export function lineColOfPos(sourceFile: ts.SourceFile, pos: number): Position {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, column: lc.character }; // TS is 0-indexed for line
}
