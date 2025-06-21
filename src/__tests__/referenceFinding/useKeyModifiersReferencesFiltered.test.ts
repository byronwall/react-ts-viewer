import { describe, expect, it } from "vitest";
import path from "path";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";

// NEW: validates the default behaviour (includeTypeReferences = false)

describe("reference finder – useKeyModifiers.handleKeyDown (no type references)", () => {
  it("should detect external references but ignore type-only identifiers", () => {
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
      includeTypeReferences: false,
    });

    expect(references).toMatchSnapshot();
  });
});
