import { flattenNode } from "./flattenNode";

import { type BuildScopeTreeOptions, type ScopeNode } from "../../types";

// Example Usage (for testing - remove or comment out in production extension code):
// if (require.main === module) {
//   const exampleFilePath = path.join(__dirname, '../../src/__tests__/__fixtures__/controlFlows.ts'); // Adjust path as needed
//   if (fs.existsSync(exampleFilePath)) {
//     const tree = buildScopeTree(exampleFilePath);
//     fs.writeFileSync(path.join(__dirname, 'scopeTreeOutput_controlFlows.json'), JSON.stringify(tree, null, 2));
//     console.log('Scope tree generated to scopeTreeOutput_controlFlows.json');
//   } else {
//     console.error('Example file not found:', exampleFilePath);
//   }
// }
// --- START: Node Flattening and Grouping Logic ---

export function flattenTree(
  rootNode: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  // Deep clone the root to avoid modifying the original
  // A proper deep clone might be needed if ScopeNode has complex nested objects not handled by spread
  const result = {
    ...rootNode,
    // Ensure children array exists before mapping, and clone children
    children: (rootNode.children || []).map((child) => ({ ...child })),
  };

  // Process each child recursively
  result.children = result.children.map((child) => flattenNode(child, options)); // Pass a copy to flattenNode

  return result;
}
