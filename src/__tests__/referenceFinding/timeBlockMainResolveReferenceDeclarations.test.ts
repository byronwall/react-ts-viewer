import { describe, expect, it } from "vitest";
import path from "path";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";

// New test focusing on the <main> JSX element inside the TimeBlock component.
describe("reference declaration resolver – TimeBlock.<main> element", () => {
  it("should map each external reference to its declaration", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "TimeBlock.tsx"
    );

    // Locate the first <main> element within the TimeBlock component.
    const { focusNode, rootNode } = createRefGraphObjs(fixturePath, "<main>");

    const { references } = buildSemanticReferenceGraph(focusNode, rootNode, {
      includeTypeReferences: true,
    });

    // Snapshot keeps output stable and easy to inspect.
    expect(references).toMatchSnapshot();
  });
});
