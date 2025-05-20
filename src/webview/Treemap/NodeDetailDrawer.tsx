import React, { useState } from "react";
import { ScopeNode } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { CodeBlock } from "../CodeBlock";

interface NodeDetailDrawerProps {
  node: ScopeNode | null;
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  settings: TreemapSettings;
  onJumpToSource: (node: ScopeNode) => void;
  onDrillIntoNode: (node: ScopeNode) => void;
  width: number;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  node,
  isOpen,
  onClose,
  fileName,
  settings,
  onJumpToSource,
  onDrillIntoNode,
  width,
}) => {
  const [wordWrapEnabled, setWordWrapEnabled] = useState<boolean>(true);

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
        width: `${width}px`,
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
        <div>
          <button
            onClick={() => onJumpToSource(node)}
            style={{
              background: "none",
              border: "1px solid #555",
              borderRadius: "3px",
              color: "#cccccc",
              cursor: "pointer",
              fontSize: "0.8em",
              marginRight: "5px",
              padding: "3px 6px",
            }}
            title="Jump to Source (Cmd+Click)"
          >
            Jump to Source
          </button>
          <button
            onClick={() => onDrillIntoNode(node)}
            style={{
              background: "none",
              border: "1px solid #555",
              borderRadius: "3px",
              color: "#cccccc",
              cursor: "pointer",
              fontSize: "0.8em",
              marginRight: "10px",
              padding: "3px 6px",
            }}
            title="Drill In (Alt+Click)"
          >
            Drill In
          </button>
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
                display: "flex", // Added for inline layout
                justifyContent: "space-between", // Align items
                alignItems: "center", // Vertically align items
              }}
            >
              <span>Source snippet:</span>
              {/* Checkbox for word wrap */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontSize: "0.9em",
                }}
              >
                <input
                  type="checkbox"
                  checked={wordWrapEnabled}
                  onChange={() => setWordWrapEnabled(!wordWrapEnabled)}
                  style={{ marginRight: "4px" }}
                />
                Word Wrap
              </label>
            </div>
            <div
              style={{
                overflowY: "auto",
                background: "#1e1e1e",
                padding: "5px", // Reset padding as button is gone
                marginTop: "3px", // Added margin top back
              }}
            >
              <CodeBlock
                raw={node.source.trim()}
                lang={codeBlockLang}
                wordWrapEnabled={wordWrapEnabled}
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
