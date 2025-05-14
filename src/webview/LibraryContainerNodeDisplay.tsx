import * as React from "react";
import { useMemo } from "react";
import { useReactFlow } from "reactflow";
import { CustomNodeProps, nodeWidth, nodeHeight } from "./App";

export const LibraryContainerNodeDisplay: React.FC<CustomNodeProps> = (
  props
) => {
  const { getNodes } = useReactFlow();

  const childNodesCount = useMemo(() => {
    const allNodes = getNodes();
    return allNodes.filter((n) => n.parentId === props.id && !n.hidden).length;
  }, [props.id, getNodes, props.data]);

  return (
    <div
      style={{
        padding: 5,
        border: "1px solid #8B4513",
        background: "#4a2f19",
        color: "#E0E0E0",
        borderRadius: "5px",
        width: props.width || nodeWidth,
        height: props.height || nodeHeight,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <strong style={{ fontSize: "0.9em", marginBottom: "1px" }}>
        {props.data?.label || "Library"}
      </strong>
      {childNodesCount > 0 && (
        <span
          style={{ fontSize: "0.7em", color: "#A0A0A0", marginBottom: "2px" }}
        >
          ({childNodesCount} import{childNodesCount === 1 ? "" : "s"})
        </span>
      )}
    </div>
  );
};
