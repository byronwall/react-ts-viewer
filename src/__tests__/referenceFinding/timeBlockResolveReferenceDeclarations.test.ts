import { describe, expect, it } from "vitest";
import path from "path";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";

describe("reference declaration resolver – TimeBlock.handleMouseDown", () => {
  it("should map each external reference to its declaration", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "TimeBlock.tsx"
    );

    const { focusNode, rootNode } = createRefGraphObjs(
      fixturePath,
      "handleMouseDown"
    );

    const { references } = buildSemanticReferenceGraph(focusNode, rootNode);

    // Snapshot to keep output stable and easy to inspect
    expect(references).toMatchSnapshot();
  });
});
