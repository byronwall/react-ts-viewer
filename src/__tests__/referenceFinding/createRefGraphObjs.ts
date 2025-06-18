import fs from "fs";
import path from "path";
import { buildScopeTree } from "../../parsers/buildScopeTree";
import { findNode } from "./findNode";

export function createRefGraphObjs() {
  const fixturePath = path.join(
    __dirname,
    "..",
    "__fixtures__",
    "useKeyModifiers.tsx"
  );
  const code = fs.readFileSync(fixturePath, "utf8");

  // Build full scope tree for the file
  const rootNode = buildScopeTree(fixturePath, code);

  // Locate the handleKeyDown arrow function node
  const focusNode = findNode(
    rootNode,
    (n) => typeof n.label === "string" && n.label.startsWith("handleKeyDown")
  );

  if (!focusNode) {
    throw new Error("Failed to locate handleKeyDown node in scope tree");
  }
  return { focusNode, rootNode };
}
