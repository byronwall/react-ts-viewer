import { describe, expect, it } from "vitest";
import path from "path";

import { buildSemanticReferenceGraph } from "../../webview/Treemap/ref_graph/buildSemanticReferenceGraph";
import { createRefGraphObjs } from "./createRefGraphObjs";

// This test mirrors the other reference-resolution suites but targets the
// simple JSX file containing a <main> element.  We want to ensure we can
// capture the external reference to the `name` variable that is interpolated
// inside the <main> block.

describe("reference declaration resolver – simpleJsx.<main>", () => {
  it("should map each external reference inside <main> to its declaration", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "simpleJsx.tsx"
    );

    const { focusNode, rootNode } = createRefGraphObjs(fixturePath, "<main>");

    const { references } = buildSemanticReferenceGraph(focusNode, rootNode);

    // Snapshot to keep output stable and easy to inspect
    expect(references).toMatchSnapshot();
  });
});
