import { describe, expect, it } from "vitest";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";

describe("buildSemanticReferenceGraph", () => {
  it("should build a semantic graph", () => {
    const { focusNode, rootNode } = createRefGraphObjs();
    const { references } = buildSemanticReferenceGraph(focusNode, rootNode);

    expect(references).toMatchSnapshot();
  });
});
