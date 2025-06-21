import { describe, expect, it } from "vitest";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";
import path from "path";

describe("reference declaration resolver – useKeyModifiers.handleKeyDown", () => {
  it("should map each external reference to its declaration", () => {
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

    const { references } = buildSemanticReferenceGraph(focusNode, rootNode, {
      includeTypeReferences: true,
    });

    // Snapshot to keep output stable and easy to inspect
    expect(references).toMatchSnapshot();
  });
});
