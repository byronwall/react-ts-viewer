import { ScopeNode, NodeCategory } from "../types";

// Helper function to generate display labels based on node category and PRD notes
export const getNodeDisplayLabel = (nodeData: ScopeNode): string => {
  const { category, label, loc, source, kind, children, meta } = nodeData; // children is part of nodeData, meta added
  const lineRange =
    loc && children && children.length > 0
      ? ` [${loc.start.line}-${loc.end.line}]`
      : "";

  let baseLabel = "";

  switch (category) {
    case NodeCategory.JSX:
      baseLabel = `<${label || "JSXElement"}>${lineRange}`;
      break;
    case NodeCategory.Function:
      baseLabel = `${label || "fn"}()${lineRange}`;
      break;
    case NodeCategory.ArrowFunction:
      baseLabel =
        (label && label !== "ArrowFunction" ? `${label}() => {}` : `() => {}`) +
        lineRange;
      break;
    case NodeCategory.Variable:
      baseLabel = `[${label || "var"}]${lineRange}`;
      break;
    case NodeCategory.Class:
      baseLabel = `[${label || "class"}]${lineRange}`;
      break;
    case NodeCategory.Import:
      baseLabel = `[${label || "import"}]${lineRange}`;
      break;
    case NodeCategory.Program:
      baseLabel = `${label}${lineRange}`; // Usually the filename
      break;
    case NodeCategory.Module:
      baseLabel = `Module: ${label}${lineRange}`;
      break;
    case NodeCategory.Block:
      baseLabel =
        loc && loc.start.line === loc.end.line
          ? `Block (inline)${lineRange}`
          : `Block${lineRange}`;
      break;
    case NodeCategory.ControlFlow:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.Call:
      baseLabel = `${label || "call"}()${lineRange}`;
      break;
    case NodeCategory.ReactComponent:
      baseLabel = `<${label || "Component"} />${lineRange}`;
      break;
    case NodeCategory.ReactHook:
      baseLabel = `${label || "useHook"}()${lineRange}`;
      break;
    case NodeCategory.TypeAlias:
      baseLabel = `type ${label}${lineRange}`;
      break;
    case NodeCategory.Interface:
      baseLabel = `interface ${label}${lineRange}`;
      break;
    case NodeCategory.Literal:
      baseLabel = `Literal: ${label !== "Literal" && label ? label : source ? source.substring(0, 20) : ""}${lineRange}`;
      break;
    case NodeCategory.SyntheticGroup:
      baseLabel = `Group: ${label}${lineRange}`;
      break;
    case NodeCategory.JSXElementDOM:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.JSXElementCustom:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.ConditionalBlock: {
      baseLabel = `${label}${lineRange}`;
      break;
    }
    case NodeCategory.IfClause:
    case NodeCategory.ElseClause:
    case NodeCategory.ElseIfClause:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.ReturnStatement:
      baseLabel = `${label}${lineRange}`;
      break;
    case NodeCategory.Assignment:
      baseLabel = `${label}${lineRange}`;
      break;

    // Markdown specific labels
    case NodeCategory.MarkdownHeading:
      baseLabel = `H: ${label}${lineRange}`;
      break;
    case NodeCategory.MarkdownParagraph:
      // For paragraphs, the label might be the first few words of the content
      baseLabel = `P: ${label.substring(0, 20)}${label.length > 20 ? "..." : ""}${lineRange}`;
      break;
    case NodeCategory.MarkdownBlockquote:
      baseLabel = `Quote: ${label.substring(0, 15)}${label.length > 15 ? "..." : ""}${lineRange}`;
      break;
    case NodeCategory.MarkdownCodeBlock:
      // Label might include language if available in meta, e.g., meta.lang
      baseLabel = `Code (${nodeData.meta?.lang || ""})${lineRange}`;
      break;
    case NodeCategory.MarkdownList: {
      // Show a preview of the first list item's text, if available
      let preview = "";
      let listChildren = children;
      if (!listChildren && nodeData.children) {
        listChildren = nodeData.children;
      }
      if (listChildren && listChildren.length > 0) {
        const firstListItem = listChildren.find(
          (child) => child.category === NodeCategory.MarkdownListItem
        );
        if (firstListItem && typeof firstListItem.label === "string") {
          preview =
            firstListItem.label.substring(0, 20) +
            (firstListItem.label.length > 20 ? "..." : "");
        }
      } else if (nodeData.source && typeof nodeData.source === "string") {
        // Fallback: extract first list item from the source string
        const lines = nodeData.source.split(/\r?\n/);
        const firstItemLine = lines.find((line) =>
          /^\s*([-*]|\d+\.)\s+/.test(line)
        );
        if (firstItemLine) {
          // Remove the list marker and trim
          preview = firstItemLine
            .replace(/^\s*([-*]|\d+\.)\s+/, "")
            .substring(0, 20);
          if (firstItemLine.length > 20) preview += "...";
        }
      }
      baseLabel = preview ? `List: ${preview}${lineRange}` : `List${lineRange}`;
      break;
    }
    case NodeCategory.MarkdownListItem:
      baseLabel = `Item: ${label.substring(0, 15)}${label.length > 15 ? "..." : ""}${lineRange}`;
      break;
    case NodeCategory.MarkdownTable:
      baseLabel = `Table${lineRange}`;
      break;
    case NodeCategory.MarkdownImage:
      // Label could be alt text if available
      baseLabel = `Image: ${label || "(no alt text)"}${lineRange}`;
      break;
    case NodeCategory.MarkdownThematicBreak:
      baseLabel = `---${lineRange}`;
      break;

    default:
      baseLabel = `${category}: ${label}${lineRange}`;
      break;
  }

  // Prepend glyph if constrained by depth
  if (meta?.isConstrainedByDepth) {
    return `▼ ${baseLabel}`;
  }
  return baseLabel;
};
