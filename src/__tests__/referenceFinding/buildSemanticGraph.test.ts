import { describe, expect, it } from "vitest";
import path from "path";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";

describe("buildSemanticReferenceGraph", () => {
  it("should build a semantic graph", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "useKeyModifiers.tsx"
    );
    const { focusNode, rootNode } = createRefGraphObjs(
      fixturePath,
      "handleKeyDown"
    );
    const { references, nodes } = buildSemanticReferenceGraph(
      focusNode,
      rootNode
    );

    expect(references).toMatchSnapshot();
    expect(nodes).toMatchSnapshot();
  });
});
