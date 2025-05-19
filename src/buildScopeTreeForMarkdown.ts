import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import * as path from "path";
import { visit } from "unist-util-visit";
import { ScopeNode, NodeCategory, Position } from "./types";

// --- END: Node Filtering Logic ---
export function buildScopeTreeForMarkdown(
  filePath: string,
  fileText: string
): ScopeNode {
  const mdastTree = fromMarkdown(fileText, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  const rootNodeId = filePath; // Using filePath as the root ID
  const root: ScopeNode = {
    id: rootNodeId,
    kind: 0, // Using a generic kind for Markdown root, not a ts.SyntaxKind
    category: NodeCategory.Program, // Treat Markdown file as a Program
    label: path.basename(filePath),
    loc: {
      start: { line: 1, column: 0 },
      // mdastTree.position is optional. If not present, estimate or use fixed end.
      end: mdastTree.position
        ? unistPositionToScopePosition(mdastTree.position.end)
        : { line: fileText.split("\n").length, column: 0 },
    },
    source: fileText, // Root source is the entire file
    value: fileText.length, // Root value is the length of the entire file
    children: [],
    meta: {}, // Ensure meta exists
  };
  root.meta!.depth = 0; // Root has depth 0 for heading comparison logic

  let nodeIdCounter = 0; // For unique IDs within the file if positions are not enough

  const headingContextStack: ScopeNode[] = [root];
  const mdastNodeToScopeNode = new Map<any, ScopeNode>();
  mdastNodeToScopeNode.set(mdastTree, root); // Map the root mdast tree to the root ScopeNode

  visit(
    mdastTree,
    (node: any, nodeIndexInParent?: number, nodeMdastParent?: any) => {
      // We are only interested in block-level elements that have a position.
      // We will not create nodes for 'text', 'emphasis', 'strong', 'inlineCode', 'link' etc.
      // Also, skip 'root' itself as we've created a ScopeNode for it.
      if (!node.position || node.type === "root") {
        return; // Skip nodes without position or the root mdast node
      }

      const category = mapMdastTypeToCategory(node.type);

      // Filter out categories we don't want to create nodes for
      if (
        category === NodeCategory.Other || // Skip 'Other' from mapMdastTypeToCategory
        // Explicitly skip these types even if they have positions:
        node.type === "text" ||
        node.type === "emphasis" || // italic
        node.type === "strong" || // bold
        node.type === "inlineCode" ||
        node.type === "link" ||
        node.type === "linkReference" ||
        node.type === "imageReference" || // image is handled, not reference
        node.type === "footnoteReference" ||
        node.type === "footnoteDefinition" ||
        node.type === "definition" || // for link references
        node.type === "html" || // raw HTML
        node.type === "yaml" || // frontmatter
        node.type === "tableRow" || // Handled by Table
        node.type === "tableCell" // Handled by Table
      ) {
        return;
      }

      // For Markdown, we typically don't have the same concept of "kind" as ts.SyntaxKind
      // We can use a placeholder or a new enum if necessary. For now, 0.
      const kind = 0;
      const label = deriveMarkdownLabel(node, fileText); // let, as heading label is modified
      const loc = {
        start: unistPositionToScopePosition(node.position.start),
        end: unistPositionToScopePosition(node.position.end),
      };
      // Ensure startPos and endPos are valid before substring
      const startOffset = node.position.start.offset;
      const endOffset = node.position.end.offset;

      let source = "";
      if (
        typeof startOffset === "number" &&
        typeof endOffset === "number" &&
        startOffset <= endOffset
      ) {
        source = fileText.substring(startOffset, endOffset);
      }

      const scopeNodeId = `${filePath}:${node.position.start.line}:${node.position.start.column}:${nodeIdCounter++}`;

      const scopeNode: ScopeNode = {
        id: scopeNodeId,
        kind,
        category,
        label, // Initial label, might be updated for headings
        loc,
        source, // Node's direct source initially
        value: source.length, // Node's direct value initially
        children: [],
        meta: {},
      };

      if (node.type === "code" && node.lang) {
        scopeNode.meta = { lang: node.lang };
      }
      if (node.type === "heading" && node.depth) {
        if (!scopeNode.meta) scopeNode.meta = {}; // Ensure meta exists before adding depth
        scopeNode.meta.depth = node.depth;
        // Update label for headings to include Hx prefix.
        scopeNode.label = `H${node.depth}: ${label.replace(/^Heading\s*/, "").trim()}`;
      }

      mdastNodeToScopeNode.set(node, scopeNode); // Map this mdast node to its ScopeNode

      let actualParentScopeNode: ScopeNode | undefined = undefined;

      if (scopeNode.category === NodeCategory.MarkdownHeading) {
        const newDepth = scopeNode.meta!.depth!; // Headings always have depth due to the check above
        while (headingContextStack.length > 1) {
          const topOfStack =
            headingContextStack[headingContextStack.length - 1];

          if (topOfStack) {
            // Explicit check for topOfStack
            const topOfStackDepth = topOfStack.meta?.depth;
            // If top is a heading/root AND its depth is less than new heading's depth, it's a valid parent
            if (
              (topOfStack.category === NodeCategory.MarkdownHeading ||
                topOfStack === root) &&
              typeof topOfStackDepth === "number" &&
              topOfStackDepth < newDepth
            ) {
              break;
            }
          } else {
            // This case should ideally not be reached if headingContextStack always contains root.
            break;
          }
          // Otherwise, current newDepth heading closes/is sibling to topOfStack or closes a non-heading section
          headingContextStack.pop();
        }
        actualParentScopeNode =
          headingContextStack[headingContextStack.length - 1];
        if (!actualParentScopeNode) actualParentScopeNode = root;
        headingContextStack.push(scopeNode);
      } else {
        // Default to current heading context.
        // headingContextStack always contains root, so headingContextStack.length-1 is a valid index.
        actualParentScopeNode =
          headingContextStack[headingContextStack.length - 1];

        // Check if there's a more specific mdast parent that is NOT the root Program node
        // and NOT a heading itself (as headings manage their own context).
        // This allows list items to be parented by lists, etc.
        if (nodeMdastParent && mdastNodeToScopeNode.has(nodeMdastParent)) {
          const potentialMdastParentScopeNode =
            mdastNodeToScopeNode.get(nodeMdastParent);

          if (
            potentialMdastParentScopeNode &&
            potentialMdastParentScopeNode !== root &&
            potentialMdastParentScopeNode.category !==
              NodeCategory.MarkdownHeading
          ) {
            actualParentScopeNode = potentialMdastParentScopeNode;
          }
        }

        // Final safety net, though actualParentScopeNode should always be set by now
        // (either to a heading context or a specific mdast parent).
        if (!actualParentScopeNode) {
          actualParentScopeNode = root; // Should be extremely rare, if ever.
        }
      }

      actualParentScopeNode!.children.push(scopeNode);

      // 'SKIP' is not returned, allowing visit to process children.
      // Unwanted children (like 'text' within a paragraph) are filtered by category check at the start.
    }
  );

  // After the initial tree build, recursively aggregate source text upwards.
  function aggregateSourcePostOrder(scopeNode: ScopeNode): void {
    if (!scopeNode.children || scopeNode.children.length === 0) {
      // Leaf node or node with no actual children in the ScopeNode tree.
      // Its source and value are already its direct content.
      return;
    }

    // Recursively call for children first, so their sources are aggregated.
    for (const child of scopeNode.children) {
      aggregateSourcePostOrder(child);
    }

    // Now, aggregate children's (already aggregated) sources into this node.
    // Start with the node's own direct source text.
    let newAggregatedSource = scopeNode.source;

    for (const child of scopeNode.children) {
      if (child.source && child.source.length > 0) {
        newAggregatedSource += "\n" + child.source;
      }
    }

    scopeNode.source = newAggregatedSource;
    scopeNode.value = newAggregatedSource.length;
  }

  // Aggregate sources for all top-level children of the root.
  // The root node itself keeps its source as the full fileText and its value as fileText.length.
  // Its direct children will have their sources and values updated by the post-order traversal.
  for (const child of root.children) {
    aggregateSourcePostOrder(child);
  }

  return root;
}

// Helper to convert micromark/unist Position to our Position
function unistPositionToScopePosition(unistPos: any): Position {
  return {
    line: unistPos.line, // unist line is 1-based
    column: unistPos.column - 1, // unist column is 1-based, our column is 0-based
  };
}

// Helper to map mdast node types to NodeCategory
function mapMdastTypeToCategory(mdastType: string): NodeCategory {
  switch (mdastType) {
    case "heading":
      return NodeCategory.MarkdownHeading;
    case "paragraph":
      return NodeCategory.MarkdownParagraph;
    case "blockquote":
      return NodeCategory.MarkdownBlockquote;
    case "code": // This is for code blocks
      return NodeCategory.MarkdownCodeBlock;
    case "list":
      return NodeCategory.MarkdownList;
    case "listItem":
      return NodeCategory.MarkdownListItem;
    case "table":
      return NodeCategory.MarkdownTable;
    case "image":
      return NodeCategory.MarkdownImage;
    case "thematicBreak":
      return NodeCategory.MarkdownThematicBreak;
    // mdast types not creating ScopeNodes:
    // 'text', 'emphasis', 'strong', 'inlineCode', 'link', 'linkReference', 'imageReference',
    // 'footnoteReference', 'footnoteDefinition', 'definition', 'html', 'yaml' (frontmatter)
    // 'tableRow', 'tableCell' (children of Table, not direct ScopeNodes for now)
    default:
      return NodeCategory.Other; // Or a more specific Markdown "Other" if needed
  }
}

// Helper to derive label from mdast node
function deriveMarkdownLabel(mdastNode: any, fileText: string): string {
  switch (mdastNode.type) {
    case "heading":
      // Concatenate text content of heading children
      return (
        mdastNode.children
          ?.map((child: any) => (child.type === "text" ? child.value : ""))
          .join("") || "Heading" // Default if no text, will be prefixed with Hx:
      );
    case "paragraph": {
      // First few words or characters
      const paragraphText = mdastNode.children
        ?.map((child: any) => (child.type === "text" ? child.value : ""))
        .join("");
      return paragraphText
        ? paragraphText.substring(0, 30) +
            (paragraphText.length > 30 ? "..." : "")
        : "Paragraph";
    }
    case "blockquote":
      return "Blockquote";
    case "code":
      return mdastNode.lang ? `Code (${mdastNode.lang})` : "Code Block";
    case "list":
      return mdastNode.ordered ? "Ordered List" : "Unordered List";
    case "listItem": {
      // For list items, we might take the first line of text content
      const listItemText = mdastNode.children?.[0]?.children?.[0]?.value; // Assuming listItem > paragraph > text
      return listItemText
        ? listItemText.substring(0, 20) +
            (listItemText.length > 20 ? "..." : "")
        : "List Item";
    }
    case "table":
      return "Table";
    case "image":
      return mdastNode.alt || mdastNode.title || "Image";
    case "thematicBreak":
      return "---";
    default:
      return mdastNode.type;
  }
}
