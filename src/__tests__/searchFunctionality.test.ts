import { describe, it, expect } from "vitest";
import { NodeCategory, ScopeNode } from "../types";
import {
  nodeMatchesSearch,
  findMatchingNodesAndPaths,
} from "../webview/Treemap/TreemapDisplay";

describe("Search Functionality", () => {
  const createTestNode = (
    id: string,
    label: string,
    source?: string,
    children?: ScopeNode[]
  ): ScopeNode => ({
    id,
    kind: 0, // ts.SyntaxKind placeholder
    category: NodeCategory.Function,
    label,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
    source: source || "",
    value: 1,
    children: children || [],
  });

  describe("nodeMatchesSearch", () => {
    it("should return false for empty search text", () => {
      const node = createTestNode("test", "TestFunction");
      expect(nodeMatchesSearch(node, "")).toBe(false);
      expect(nodeMatchesSearch(node, "   ")).toBe(false);
    });

    it("should match node label case-insensitively", () => {
      const node = createTestNode("test", "TestFunction");
      expect(nodeMatchesSearch(node, "test")).toBe(true);
      expect(nodeMatchesSearch(node, "TEST")).toBe(true);
      expect(nodeMatchesSearch(node, "Function")).toBe(true);
      expect(nodeMatchesSearch(node, "func")).toBe(true);
    });

    it("should match node source case-insensitively", () => {
      const node = createTestNode(
        "test",
        "TestFunction",
        "const myVariable = 42;"
      );
      expect(nodeMatchesSearch(node, "variable")).toBe(true);
      expect(nodeMatchesSearch(node, "VARIABLE")).toBe(true);
      expect(nodeMatchesSearch(node, "const")).toBe(true);
      expect(nodeMatchesSearch(node, "42")).toBe(true);
    });

    it("should return false for non-matching text", () => {
      const node = createTestNode(
        "test",
        "TestFunction",
        "const myVariable = 42;"
      );
      expect(nodeMatchesSearch(node, "xyz")).toBe(false);
      expect(nodeMatchesSearch(node, "notfound")).toBe(false);
    });
  });

  describe("findMatchingNodesAndPaths", () => {
    it("should return empty sets for empty search text", () => {
      const node = createTestNode("root", "Root");
      const result = findMatchingNodesAndPaths(node, "");
      expect(result.matchingNodes.size).toBe(0);
      expect(result.pathsToMatches.size).toBe(0);
    });

    it("should find direct matches", () => {
      const node = createTestNode("root", "TestFunction");
      const result = findMatchingNodesAndPaths(node, "test");
      expect(result.matchingNodes.has("root")).toBe(true);
      expect(result.pathsToMatches.has("root")).toBe(true);
    });

    it("should find matches in children and include parent paths", () => {
      const child1 = createTestNode("child1", "HelperFunction");
      const child2 = createTestNode("child2", "AnotherFunction");
      const root = createTestNode("root", "MainComponent", undefined, [
        child1,
        child2,
      ]);

      const result = findMatchingNodesAndPaths(root, "helper");

      // Should find the child that matches
      expect(result.matchingNodes.has("child1")).toBe(true);
      expect(result.matchingNodes.has("child2")).toBe(false);
      expect(result.matchingNodes.has("root")).toBe(false);

      // Should include path to the match
      expect(result.pathsToMatches.has("root")).toBe(true);
      expect(result.pathsToMatches.has("child1")).toBe(true);
      expect(result.pathsToMatches.has("child2")).toBe(false);
    });

    it("should find multiple matches and include all paths", () => {
      const child1 = createTestNode("child1", "TestHelper");
      const child2 = createTestNode("child2", "TestUtility");
      const child3 = createTestNode("child3", "OtherFunction");
      const root = createTestNode("root", "MainComponent", undefined, [
        child1,
        child2,
        child3,
      ]);

      const result = findMatchingNodesAndPaths(root, "test");

      // Should find both children that match
      expect(result.matchingNodes.has("child1")).toBe(true);
      expect(result.matchingNodes.has("child2")).toBe(true);
      expect(result.matchingNodes.has("child3")).toBe(false);
      expect(result.matchingNodes.has("root")).toBe(false);

      // Should include path to all matches
      expect(result.pathsToMatches.has("root")).toBe(true);
      expect(result.pathsToMatches.has("child1")).toBe(true);
      expect(result.pathsToMatches.has("child2")).toBe(true);
      expect(result.pathsToMatches.has("child3")).toBe(false);
    });

    it("should handle nested children correctly", () => {
      const grandchild = createTestNode("grandchild", "DeepFunction");
      const child = createTestNode("child", "MiddleComponent", undefined, [
        grandchild,
      ]);
      const root = createTestNode("root", "TopComponent", undefined, [child]);

      const result = findMatchingNodesAndPaths(root, "deep");

      // Should find the deeply nested match
      expect(result.matchingNodes.has("grandchild")).toBe(true);
      expect(result.matchingNodes.has("child")).toBe(false);
      expect(result.matchingNodes.has("root")).toBe(false);

      // Should include entire path to the match
      expect(result.pathsToMatches.has("root")).toBe(true);
      expect(result.pathsToMatches.has("child")).toBe(true);
      expect(result.pathsToMatches.has("grandchild")).toBe(true);
    });
  });
});
