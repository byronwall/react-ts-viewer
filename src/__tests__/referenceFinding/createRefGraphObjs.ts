import fs from "fs";
import { buildScopeTree } from "../../parsers/buildScopeTree";
import { findNode } from "./findNode";

// Create the focus and root scope node objects needed for reference-graph tests.
//
// Parameters:
//   fixturePath          – Absolute or relative path to the file you want to analyze.
//   focusNodeSelector    – Either a predicate that returns true for the node you
//                          want to focus on OR a string. When a string is
//                          provided, the first node whose label starts with that
//                          string will be selected.
//
export function createRefGraphObjs(
  fixturePath: string,
  focusNodeSelector: string | ((n: any) => boolean)
) {
  const code = fs.readFileSync(fixturePath, "utf8");

  // Build full scope tree for the file
  const rootNode = buildScopeTree(fixturePath, code);

  // Derive the predicate function used to locate the focus node
  const predicate =
    typeof focusNodeSelector === "function"
      ? focusNodeSelector
      : (n: any) =>
          typeof n.label === "string" &&
          n.label.startsWith(String(focusNodeSelector));

  // Locate the focus node within the scope tree
  const focusNode = findNode(rootNode, predicate);

  if (!focusNode) {
    throw new Error(
      `Failed to locate focus node using selector: ${focusNodeSelector}`
    );
  }

  return { focusNode, rootNode };
}
