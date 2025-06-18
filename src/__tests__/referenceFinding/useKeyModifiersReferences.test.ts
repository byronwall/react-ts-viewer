import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

import { buildScopeTree } from "../../parsers/buildScopeTree";
import { analyzeBOI } from "../../webview/Treemap/ref_graph/layoutELK";

// Utility to recursively find a node by predicate
function findNode(node: any, pred: (n: any) => boolean): any | null {
  if (pred(node)) return node;
  if (node.children) {
    for (const c of node.children) {
      const found = findNode(c, pred);
      if (found) return found;
    }
  }
  return null;
}

describe("reference finder – useKeyModifiers.handleKeyDown", () => {
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

  it("should detect the expected external references", () => {
    const analysis = analyzeBOI(focusNode, rootNode);

    // Snapshot just the external references (makes diffs clean)
    expect(
      analysis.externalReferences.map(
        ({ name, type, position, direction }) => ({
          name,
          type,
          position,
          direction,
        })
      )
    ).toMatchSnapshot();
  });
});
