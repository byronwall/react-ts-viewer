import { Position } from "../../types";

// Helper to convert micromark/unist Position to our Position
export function unistPositionToScopePosition(unistPos: any): Position {
  return {
    line: unistPos.line, // unist line is 1-based
    column: unistPos.column - 1, // unist column is 1-based, our column is 0-based
  };
}
