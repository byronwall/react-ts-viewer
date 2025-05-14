import * as React from "react";
import { useMemo } from "react";
import { useReactFlow } from "reactflow";
import { CustomNodeProps, nodeWidth, nodeHeight } from "./App";

// Placeholder components for new node types
export const FileContainerNodeDisplay: React.FC<CustomNodeProps> = (props) => {
  const { getNodes } = useReactFlow();
  const filePath = props.data?.filePath || props.data?.label || "";
  const parts = filePath.split("/");
  const fileName = parts.pop() || filePath;
  const dirPath = parts.length > 0 ? parts.join("/") : "";

  const childNodesCount = useMemo(() => {
    const allNodes = getNodes();
    return allNodes.filter((n) => n.parentId === props.id && !n.hidden).length;
  }, [props.id, getNodes, props.data]);

  return (
    <div
      style={{
        padding: 5,
        border: "1px solid #3E863E",
        background: "#1f3d1f",
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
        {fileName}
      </strong>
      {childNodesCount > 0 && (
        <span
          style={{ fontSize: "0.7em", color: "#A0A0A0", marginBottom: "2px" }}
        >
          ({childNodesCount} item{childNodesCount === 1 ? "" : "s"})
        </span>
      )}
      {dirPath && (
        <span style={{ fontSize: "0.65em", color: "#909090" }}>{dirPath}</span>
      )}
    </div>
  );
};
