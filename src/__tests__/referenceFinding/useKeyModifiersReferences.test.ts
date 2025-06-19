import { describe, expect, it } from "vitest";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";
import path from "path";

describe("reference finder – useKeyModifiers.handleKeyDown", () => {
  it("should detect the expected external references", () => {
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
    const { references } = buildSemanticReferenceGraph(focusNode, rootNode);

    // Snapshot just the references (makes diffs clean)
    expect(references).toMatchSnapshot();
  });
});
