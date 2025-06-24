import { ArrowSquareOut, FunnelSimple, X } from "@phosphor-icons/react";
import React, { useMemo, useState } from "react";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";

import { type ScopeNode } from "../../types";
import { CodeBlock } from "../CodeBlock";
import { type TreemapSettings } from "../settingsConfig";

import { createPortal } from "react-dom";

interface NodeDetailDrawerProps {
  node: ScopeNode | null;
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  settings: TreemapSettings;
  onJumpToSource: (node: ScopeNode) => void;
  onDrillIntoNode: (node: ScopeNode) => void;
  width: number;
  references?: (import("./ref_graph/buildSemanticReferenceGraph").SemanticReference & {
    snippet?: string;
  })[];
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
  references,
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
        height: "100%", // Ensure full height to eliminate transparent regions
        width: `${width}px`,
        backgroundColor: "#252526", // Opaque background
        color: "#cccccc",
        borderLeft: "1px solid #333333",
        padding: "10px",
        overflowY: "auto", // Allow entire drawer to scroll
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative", // Ensure proper positioning
      }}
      className="node-detail-drawer"
    >
      {/* Sticky header containing action buttons and (optionally) references */}
      <div
        style={{
          marginBottom: "8px",
          flexShrink: 0,
          paddingBottom: "8px",
        }}
      >
        {/* References list (if provided) */}
        {references && references.length > 0 && (
          <div
            style={{
              marginBottom: "10px",
              width: "100%",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "0.9em" }}>
              References ({references.length})
            </h4>

            {(() => {
              // Group references by name and sort alphabetically
              const grouped = useMemo(() => {
                const map = new Map<string, typeof references>();
                references.forEach((ref) => {
                  if (!map.has(ref.name)) {
                    map.set(ref.name, []);
                  }
                  map.get(ref.name)!.push(ref);
                });
                return Array.from(map.entries()).sort((a, b) =>
                  a[0].localeCompare(b[0])
                );
              }, [references]);

              return (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    marginTop: "6px",
                  }}
                >
                  {grouped.map(([name, refs], groupIdx) => (
                    <li
                      key={name}
                      style={{
                        marginBottom: "4px",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      {(() => {
                        const singleRef = refs.length === 1 ? refs[0] : null;
                        const tooltipId = `single-ref-tip-${groupIdx}`;
                        return (
                          <>
                            <span
                              data-tooltip-id={
                                singleRef ? tooltipId : undefined
                              }
                              style={{
                                color: "#4fc3f7",
                                marginRight: "6px",
                                whiteSpace: "nowrap",
                                cursor: singleRef ? "pointer" : "default",
                              }}
                            >
                              {name}
                            </span>
                            {singleRef &&
                              createPortal(
                                <Tooltip
                                  id={tooltipId}
                                  place="left"
                                  delayShow={100}
                                  delayHide={100}
                                  style={{
                                    backgroundColor: "#111111",
                                    color: "#f0f0f0",
                                    border: "1px solid #555555",
                                    borderRadius: "4px",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                                    maxWidth: "420px",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    fontSize: "11px",
                                    lineHeight: 1.3,
                                    padding: "6px 8px",
                                    zIndex: 100000,
                                  }}
                                >
                                  <pre
                                    style={{
                                      margin: 0,
                                      padding: 0,
                                      backgroundColor: "transparent",
                                      color: "#f0f0f0",
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      fontSize: "11px",
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {singleRef.snippet || "(no snippet)"}
                                  </pre>
                                </Tooltip>,
                                document.body
                              )}
                          </>
                        );
                      })()}

                      {/* Render line-number links for each reference */}
                      {refs.map((ref, refIdx) => {
                        const id = `ref-tip-${groupIdx}-${refIdx}`;
                        return (
                          <span
                            key={refIdx}
                            style={{
                              marginRight: "6px",
                              fontSize: "0.8em",
                              color: "#999",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span
                              data-tooltip-id={id}
                              style={{ cursor: "pointer", color: "#999" }}
                            >
                              @{ref.position.line}:{ref.position.character}
                            </span>
                            {createPortal(
                              <Tooltip
                                id={id}
                                place="left"
                                delayShow={100}
                                delayHide={100}
                                style={{
                                  backgroundColor: "#111111",
                                  color: "#f0f0f0",
                                  border: "1px solid #555555",
                                  borderRadius: "4px",
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                                  maxWidth: "420px",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  fontSize: "11px",
                                  lineHeight: 1.3,
                                  padding: "6px 8px",
                                  zIndex: 100000,
                                }}
                              >
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: 0,
                                    backgroundColor: "transparent",
                                    color: "#f0f0f0",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    fontSize: "11px",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {ref.snippet || "(no snippet)"}
                                </pre>
                              </Tooltip>,
                              document.body
                            )}
                          </span>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              );
            })()}

            <hr style={{ borderColor: "#444" }} />
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button
            onClick={() => onJumpToSource(node)}
            className="treemap-export-button"
            title="Jump to Source (Cmd+Click)"
          >
            <ArrowSquareOut size={14} />
            Jump
          </button>
          <button
            onClick={() => onDrillIntoNode(node)}
            className="treemap-export-button"
            title="Drill In (Alt+Click)"
          >
            <FunnelSimple size={14} />
            Drill
          </button>
          <button
            onClick={onClose}
            className="treemap-settings-button"
            title="Close Details"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <h4 style={{ margin: 0, fontSize: "0.9em", marginBottom: "8px" }}>
        Node Details: {node.id.split(":").pop()}
      </h4>

      {/* Content area follows header; overall drawer handles scrolling */}
      <div
        style={{
          flexGrow: 1,
          paddingRight: "4px", // space for scrollbar so code doesn't get hidden
        }}
      >
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
