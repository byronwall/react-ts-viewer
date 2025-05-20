import React from "react";
import { ScopeNode } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { CodeBlock } from "../CodeBlock";

interface NodeDetailDrawerProps {
  node: ScopeNode | null;
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  settings: TreemapSettings;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  node,
  isOpen,
  onClose,
  fileName,
  settings,
}) => {
  if (!isOpen || !node) {
    return null;
  }

  const codeBlockLang =
    fileName.endsWith(".md") || fileName.endsWith(".mdx") ? "markdown" : "tsx";
  // Snippet length is no longer used for truncation here
  // const snippetLength = Math.max(0, settings.tooltipSourceSnippetLength);

  return (
    <div
      style={{
        // height: "300px", // Height will be controlled by parent or set to 100% for side view
        width: "300px", // Set a fixed width for the side drawer
        backgroundColor: "#252526",
        color: "#cccccc",
        borderLeft: "1px solid #333333", // Change border to left for side view
        padding: "10px",
        overflowY: "auto",
        flexShrink: 0,
        display: "flex", // Added for internal layout
        flexDirection: "column", // Added for internal layout
      }}
      className="node-detail-drawer"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
          flexShrink: 0, // Prevent header from shrinking
        }}
      >
        <h4 style={{ margin: 0, fontSize: "0.9em" }}>
          Node Details: {node.id.split(":").pop()}
        </h4>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#cccccc",
            cursor: "pointer",
            fontSize: "1.2em",
          }}
          title="Close Details"
        >
          &times;
        </button>
      </div>

      {/* Content div to handle overflow for the rest of the items */}
      <div style={{ overflowY: "auto", flexGrow: 1 }}>
        {settings.showTooltipId && (
          <>
            <strong>ID: {node.id.split(":").pop()}</strong>
            {settings.showTooltipCategory && ` (${node.category})`}
            <br />
          </>
        )}
        {!settings.showTooltipId && settings.showTooltipCategory && (
          <>
            <strong>Category: {node.category}</strong>
            <br />
          </>
        )}
        {settings.showTooltipValue && (
          <>
            Value: {node.value} chars
            <br />
          </>
        )}
        {settings.showTooltipLines && node.loc && (
          <>
            Lines: {node.loc.start.line} - {node.loc.end.line}
            <br />
          </>
        )}
        {(node.meta?.collapsed || node.meta?.syntheticGroup) && (
          <div
            style={{
              marginTop: "5px",
              paddingTop: "5px",
              borderTop: "1px solid #444",
              color: "#aaa",
            }}
          >
            {node.meta?.collapsed && (
              <div style={{ fontStyle: "italic" }}>
                Collapsed {node.meta.originalCategory || node.category}
                {node.meta.collapsed === "arrowFunction" && node.meta.call && (
                  <> (calls: {node.meta.call})</>
                )}
              </div>
            )}
            {node.meta?.syntheticGroup && (
              <div style={{ fontWeight: "bold" }}>
                Group containing {node.meta.contains} nodes
              </div>
            )}
          </div>
        )}
        {settings.showTooltipSourceSnippet && node.source && (
          <>
            <div
              style={{
                marginTop: "5px",
                paddingTop: "5px",
                borderTop: "1px solid #444",
              }}
            >
              Source snippet:
            </div>
            <div
              style={{
                // maxHeight: "150px", // Remove maxHeight to show full snippet
                overflowY: "auto", // Keep for very long snippets, though parent div also has it
                background: "#1e1e1e",
                padding: "5px",
                marginTop: "3px",
              }}
            >
              <CodeBlock
                raw={node.source.trim()} // Show full source
                lang={codeBlockLang}
              />
            </div>
          </>
        )}
        {!node.source && settings.showTooltipSourceSnippet && (
          <p style={{ marginTop: "5px", color: "#aaa" }}>
            No source snippet available for this node.
          </p>
        )}
      </div>
    </div>
  );
};
