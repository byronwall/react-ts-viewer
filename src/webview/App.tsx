import ELK from "elkjs/lib/elk.bundled.js";
import * as React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import ReactFlow, {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Edge,
  EdgeChange,
  MarkerType,
  MiniMap,
  Node,
  NodeChange,
  NodeProps,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";

import "@reactflow/controls/dist/style.css";
import "@reactflow/minimap/dist/style.css";
import "reactflow/dist/style.css";
import "./App.css";
import TreemapDisplay, { availablePalettes } from "./TreemapDisplay"; // Import the new TreemapDisplay component
import { vscodeApi } from "./vscodeApi"; // Import the shared vscodeApi instance

// Explicitly type CustomNodeProps to include width and height
interface CustomNodeProps extends NodeProps {
  width?: number;
  height?: number;
}

// Import custom node components
import ComponentNodeDisplay from "./ComponentNodeDisplay";
import { ScopeNode } from "../types";
// FileNodeDisplay and DependencyNodeDisplay will be removed
// import FileNodeDisplay from "./FileNodeDisplay";
// import DependencyNodeDisplay from "./DependencyNodeDisplay";

// Add TreemapSettings type, ensure it's consistent with TreemapDisplay.tsx
interface TreemapSettings {
  tile: "squarify" | "binary" | "dice" | "slice" | "sliceDice";
  leavesOnly: boolean;
  innerPadding: number;
  outerPadding: number;
  enableLabel: boolean;
  labelSkipSize: number;
  nodeOpacity: number;
  borderWidth: number;
  colorPalette: string;
  // Tooltip settings
  enableTooltip: boolean;
  showTooltipId: boolean;
  showTooltipCategory: boolean;
  showTooltipValue: boolean;
  showTooltipLines: boolean;
  showTooltipSourceSnippet: boolean;
  tooltipSourceSnippetLength: number;
}

// Global declarations specific to App.tsx initialization
declare global {
  interface Window {
    initialData?: { filePath?: string };
    initialWorkspaceRoot?: string;
  }
}

// Placeholder components for new node types
const FileContainerNodeDisplay: React.FC<CustomNodeProps> = (props) => {
  const { getNodes } = useReactFlow();
  const filePath = props.data?.filePath || props.data?.label || "";
  const parts = filePath.split("/");
  const fileName = parts.pop() || filePath;
  const dirPath = parts.length > 0 ? parts.join("/") : ""; // Display empty string if no dirPath

  const childNodesCount = useMemo(() => {
    const allNodes = getNodes();
    // Only count direct children that are not themselves hidden
    return allNodes.filter((n) => n.parentId === props.id && !n.hidden).length;
  }, [props.id, getNodes, props.data]); // Added props.data to re-calc if children change affecting parent data somehow

  console.log(
    "[Webview FlowCanvas] Rendering FileContainerNodeDisplay for node:",
    props.id,
    "Data:",
    props.data,
    "W/H:",
    props.width,
    props.height
  );
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid #3E863E", // Darker green
        background: "#1f3d1f", // Dark green background
        color: "#E0E0E0", // Light text
        borderRadius: "5px",
        width: props.width || nodeWidth, // Use ELK width, fallback to default
        height: props.height || nodeHeight, // Use ELK height, fallback to default
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center", // Center content vertically
        alignItems: "flex-start", // Align content to the start (left)
      }}
    >
      <strong style={{ fontSize: "1em", marginBottom: "2px" }}>
        {fileName}
      </strong>
      {childNodesCount > 0 && (
        <span
          style={{ fontSize: "0.8em", color: "#A0A0A0", marginBottom: "4px" }}
        >
          ({childNodesCount} item{childNodesCount === 1 ? "" : "s"})
        </span>
      )}
      {dirPath && (
        <span style={{ fontSize: "0.75em", color: "#909090" }}>{dirPath}</span>
      )}
      {/* <div style={{ fontSize: '0.7em', color: '#777', marginTop: 'auto' }}>ID: {props.id}</div> */}
    </div>
  );
};

const LibraryContainerNodeDisplay: React.FC<CustomNodeProps> = (props) => {
  const { getNodes } = useReactFlow();

  const childNodesCount = useMemo(() => {
    const allNodes = getNodes();
    // Only count direct children that are not themselves hidden
    return allNodes.filter((n) => n.parentId === props.id && !n.hidden).length;
  }, [props.id, getNodes, props.data]); // Added props.data

  console.log(
    "[Webview FlowCanvas] Rendering LibraryContainerNodeDisplay for node:",
    props.id,
    "Data:",
    props.data,
    "W/H:",
    props.width,
    props.height
  );
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid #8B4513", // Darker orange/brown
        background: "#4a2f19", // Dark orange/brown background
        color: "#E0E0E0", // Light text
        borderRadius: "5px",
        width: props.width || nodeWidth, // Use ELK width, fallback to default
        height: props.height || nodeHeight, // Use ELK height, fallback to default
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <strong style={{ fontSize: "1em", marginBottom: "2px" }}>
        {props.data?.label || "Library"}
      </strong>
      {childNodesCount > 0 && (
        <span
          style={{ fontSize: "0.8em", color: "#A0A0A0", marginBottom: "4px" }}
        >
          ({childNodesCount} import{childNodesCount === 1 ? "" : "s"})
        </span>
      )}
      {/* <div style={{ fontSize: '0.7em', color: '#777', marginTop: 'auto' }}>ID: {props.id}</div> */}
    </div>
  );
};

const ExportedItemNodeDisplay: React.FC<CustomNodeProps> = (props) => {
  console.log(
    "[Webview FlowCanvas] Rendering ExportedItemNodeDisplay (placeholder) for node:",
    props.id,
    "Data:",
    props.data
  );
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid purple",
        background: "#f3e7f3",
        borderRadius: "5px",
      }}
    >
      <strong>Exported Item</strong> ({props.data?.actualType || "Unknown Type"}
      )<br />
      ID: {props.id}
      <br />
      Label: {props.data?.label || "N/A"}
    </div>
  );
};

// Interface for settings managed by the App
interface AnalysisSettings {
  maxDepth: number;
  showMinimap: boolean;
  showHooks: boolean;
  // showFileDeps: boolean; // To be removed
  showLibDeps: boolean;
}

// Initial default settings (moved before context creation)
const defaultSettings: AnalysisSettings = {
  maxDepth: 3,
  showMinimap: false,
  showHooks: true, // Default to showing
  // showFileDeps: true, // To be removed
  showLibDeps: true, // Default to showing
};

// Default Treemap settings
const defaultTreemapSettings: TreemapSettings = {
  tile: "squarify",
  leavesOnly: false,
  innerPadding: 3,
  outerPadding: 3,
  enableLabel: true,
  labelSkipSize: 12,
  nodeOpacity: 1,
  borderWidth: 1,
  colorPalette: "Default",
  // Default tooltip settings
  enableTooltip: true,
  showTooltipId: true,
  showTooltipCategory: true,
  showTooltipValue: true,
  showTooltipLines: true,
  showTooltipSourceSnippet: true,
  tooltipSourceSnippetLength: 250,
};

// --- Settings Context ---
// Export the context
export const SettingsContext =
  React.createContext<AnalysisSettings>(defaultSettings);
// --- End Settings Context ---

// --- ELK Layout ---
const elk = new ELK();

// ELK layout options
// See https://www.eclipse.org/elk/reference/options.html
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "80",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.padding": "[top=10,left=10,bottom=10,right=10]",
};

// Hardcoded node dimensions for ELK layout
// TODO: Consider making these dynamic based on node type/content
const nodeWidth = 172;
const nodeHeight = 100; // Increased height estimate

// Explicitly type the return value
const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  options = {}
): Promise<{ nodes: Node[]; edges: Edge[] } | void> => {
  console.log(
    "[Webview getLayoutedElements] Initial nodes for ELK - Count:",
    nodes.length,
    "Edges count:",
    edges.length
  );

  const layoutOptions = { ...elkOptions, ...options };
  const isHorizontal = layoutOptions["elk.direction"] === "RIGHT";

  // Transform flat list of nodes with parentId into a hierarchical structure for ELK
  const elkNodesMap = new Map();
  const rootElkNodes: any[] = []; // Using any[] for ELK node children temporarily

  nodes.forEach((node) => {
    const elkNode = {
      ...node,
      id: node.id, // Ensure id is correctly passed
      targetPosition: isHorizontal ? "left" : "top",
      sourcePosition: isHorizontal ? "right" : "bottom",
      width: node.width ?? nodeWidth,
      // For parent types, provide a minimal height to ELK to avoid errors with `undefined`,
      // but small enough that ELK must expand it based on children and padding.
      height:
        node.data?.conceptualType === "FileContainer" ||
        node.data?.conceptualType === "LibraryContainer"
          ? 20 // Provide a small, nominal height for container nodes
          : node.height ?? nodeHeight, // Use specified or default height for other nodes
      children: [], // Initialize children array for potential parent nodes
      // layoutOptions for individual nodes can be set here if needed
    };
    elkNodesMap.set(node.id, elkNode);
  });

  nodes.forEach((node) => {
    const elkNode = elkNodesMap.get(node.id);
    if (node.parentId && elkNodesMap.has(node.parentId)) {
      const parentElkNode = elkNodesMap.get(node.parentId);
      parentElkNode.children.push(elkNode);
      console.log(
        `[Webview getLayoutedElements] Node ${node.id} added as child to ${node.parentId}`
      );
    } else {
      rootElkNodes.push(elkNode);
      if (node.parentId) {
        console.warn(
          `[Webview getLayoutedElements] Node ${node.id} has parentId ${node.parentId} but parent not found in map. Adding as root.`
        );
      }
    }
  });
  console.log(
    "[Webview getLayoutedElements] Transformed root ELK nodes for layout - Count:",
    rootElkNodes.length
  );

  const graph: any = {
    id: "root",
    layoutOptions: layoutOptions,
    children: rootElkNodes, // Use the transformed hierarchical nodes
    edges: edges.map((edge) => ({
      ...edge,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  return elk
    .layout(graph)
    .then((layoutedGraph) => {
      if (!layoutedGraph || !layoutedGraph.children) {
        console.error(
          "[Webview getLayoutedElements] ELK layout failed: No graph or children returned."
        );
        return;
      }

      const finalLayoutedNodes: Node[] = [];

      // Recursive function to process ELK nodes and create React Flow nodes
      // elkNode: node from ELK layout output
      // elkParentId: ID of the parent node in the ELK layout structure (undefined for roots)
      const mapElkNodeToReactFlowNode = (
        elkNode: any,
        elkParentId?: string
      ) => {
        const originalNode = nodes.find((n) => n.id === elkNode.id);
        if (!originalNode) {
          console.warn(
            `[Webview getLayoutedElements] Original node not found for ELK node id ${elkNode.id}`
          );
          return;
        }

        const rfNode: Node = {
          ...originalNode, // Spread original data, type, etc.
          id: elkNode.id,
          // Position from ELK: for roots it's absolute, for children it's relative to their ELK parent.
          position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
          width: elkNode.width,
          height: elkNode.height,
          // parentId for React Flow is determined by the ELK hierarchy.
        };

        if (elkParentId) {
          // This node is a child in the ELK layout; its position is relative to elkParentId.
          rfNode.parentId = elkParentId;
        } else {
          // This node is a root in the ELK layout; its position is absolute.
          // We remove any pre-existing parentId from originalNode for React Flow's layouting,
          // as ELK has positioned it as a root.
          delete rfNode.parentId;
        }

        finalLayoutedNodes.push(rfNode);

        if (elkNode.children && elkNode.children.length > 0) {
          elkNode.children.forEach((childElkNode: any) => {
            // Recursively call for children, passing current elkNode.id as their ELK parent ID.
            mapElkNodeToReactFlowNode(childElkNode, elkNode.id);
          });
        }
      };

      // Start processing from the root children of the layouted graph
      layoutedGraph.children?.forEach((rootElkNode: any) => {
        mapElkNodeToReactFlowNode(rootElkNode); // Root ELK nodes have no elkParentId
      });

      console.log(
        "[Webview getLayoutedElements] Final flattened layouted nodes for React Flow - Count:",
        finalLayoutedNodes.length
      );

      return {
        nodes: finalLayoutedNodes,
        edges: edges, // Edges are assumed to be correct as per current ELK usage
      };
    })
    .catch((err) => {
      console.error("[Webview] ELK layout promise error:", err);
      // Return void in case of error
      return;
    });
};
// --- End ELK Layout ---

// --- START: transformDataForFlow Function ---
const transformDataForFlow = (
  rawNodes: Node[],
  rawEdges: Edge[]
): { nodes: Node[]; edges: Edge[] } => {
  const newNodes: Node[] = [];
  // const nodeMap = new Map(rawNodes.map(n => [n.id, n])); // Not strictly needed if parentId IDs are correct

  console.log(
    "[App.tsx transformDataForFlow] Starting transformation. Raw nodes count:",
    rawNodes.length
  );

  rawNodes.forEach((rawNode) => {
    let flowNodeType: string | undefined;
    const dataPayload: any = { ...rawNode.data }; // Copy existing data

    // Determine the primary type identifier from rawNode.data.type or rawNode.type (ReactFlow type)
    let decisionType = rawNode.data?.type; // Prefer semantic type from analysis
    if (
      !decisionType &&
      rawNode.type &&
      !["default", "input", "output", "group"].includes(rawNode.type)
    ) {
      // If rawNode.data.type is missing, but rawNode.type is a meaningful custom type (not a generic RF type)
      decisionType = rawNode.type;
      console.log(
        `[App.tsx transformDataForFlow] Using rawNode.type "${decisionType}" as decisionType for node ${rawNode.id} as data.type was missing.`
      );
    }

    // Fallback if decisionType is still not determined from relevant fields
    if (!decisionType) {
      console.warn(
        `[App.tsx transformDataForFlow] Node ${rawNode.id} has no clear 'data.type' or custom 'rawNode.type'. Label: ${rawNode.data?.label}. Skipping transformation for this node if it's not a known RF type.`
      );
      // If it's one of our already known React Flow types, preserve it.
      if (
        [
          "FileContainerNode",
          "LibraryContainerNode",
          "ExportedItemNode",
          "ComponentNode",
        ].includes(rawNode.type || "")
      ) {
        flowNodeType = rawNode.type;
      } else {
        return; // Skip node if no type can be determined
      }
    }

    if (!flowNodeType) {
      // if not set by the block above, determine it now
      switch (decisionType) {
        case "File":
          flowNodeType = "FileContainerNode";
          dataPayload.conceptualType = "FileContainer";
          break;
        case "LibraryReferenceGroup":
          flowNodeType = "LibraryContainerNode";
          dataPayload.conceptualType = "LibraryContainer";
          break;
        case "Component":
          flowNodeType = "ComponentNode"; // Use dedicated component node type
          dataPayload.conceptualType = "ExportedItem";
          dataPayload.actualType = "Component";
          break;
        case "Hook":
        case "Function":
        case "Variable":
          flowNodeType = "ExportedItemNode";
          dataPayload.conceptualType = "ExportedItem";
          dataPayload.actualType = decisionType; // "Hook", "Function", "Variable"
          break;
        case "LibraryImport":
          flowNodeType = "ExportedItemNode"; // Represent imports as items, parented by LibraryContainer
          dataPayload.conceptualType = "LibraryImportItem";
          // actualType might be the imported name, e.g. 'useState'
          dataPayload.actualType = rawNode.data?.label || decisionType;
          break;
        case "HookUsage": // Explicitly filter out HookUsage nodes
          console.log(
            `[App.tsx transformDataForFlow] Filtering out HookUsage node: ${rawNode.id} ('${rawNode.data?.label}')`
          );
          return; // Skip creating a node for HookUsage
        default:
          // Check if decisionType itself is one of the direct React Flow node types
          if (
            [
              "FileContainerNode",
              "LibraryContainerNode",
              "ExportedItemNode",
              "ComponentNode",
            ].includes(decisionType ?? "")
          ) {
            flowNodeType = decisionType;
            // Infer conceptualType if possible
            if (
              decisionType === "FileContainerNode" &&
              !dataPayload.conceptualType
            )
              dataPayload.conceptualType = "FileContainer";
            else if (
              decisionType === "LibraryContainerNode" &&
              !dataPayload.conceptualType
            )
              dataPayload.conceptualType = "LibraryContainer";
            else if (
              (decisionType === "ExportedItemNode" ||
                decisionType === "ComponentNode") &&
              !dataPayload.conceptualType
            )
              dataPayload.conceptualType = "ExportedItem";
          } else {
            console.warn(
              `[App.tsx transformDataForFlow] Unhandled decision type: "${decisionType}" for node ${rawNode.id} ('${rawNode.data?.label}'). Treating as generic ExportedItem or skipping.`
            );
            // Fallback for unknown types that might be part of the hierarchy
            if (rawNode.data?.label) {
              flowNodeType = "ExportedItemNode";
              dataPayload.conceptualType = "UnknownExport";
              dataPayload.actualType = String(decisionType);
            } else {
              return; // Skip if no label and totally unknown
            }
          }
      }
    }

    if (!flowNodeType) {
      console.warn(
        `[App.tsx transformDataForFlow] flowNodeType is still undefined for node ${rawNode.id} ('${rawNode.data?.label}'). Skipping.`
      );
      return;
    }

    let parentIdToAssign = rawNode.parentNode;

    // If this node is a FileContainerNode or LibraryContainerNode,
    // it should always be a root element in the React Flow graph.
    // This prevents one such container from inadvertently dragging another
    // if rawNode.parentNode was set unexpectedly.
    if (
      flowNodeType === "FileContainerNode" ||
      flowNodeType === "LibraryContainerNode"
    ) {
      if (parentIdToAssign) {
        // Log if we are overriding an existing parentNode
        console.log(
          `[App.tsx transformDataForFlow] Forcing ${flowNodeType} ${rawNode.id} to be a root node. Original parentNode ('${parentIdToAssign}') is being cleared.`
        );
      }
      parentIdToAssign = undefined;
    }

    const newNode: Node = {
      ...rawNode, // Spread original props (id, position will be re-calculated by ELK)
      type: flowNodeType,
      data: dataPayload,
      parentId: parentIdToAssign, // Use the potentially modified parentId
      // Ensure width/height are at least defaults if not specified, ELK might override
      width: rawNode.width ?? nodeWidth,
      height: rawNode.height ?? nodeHeight,
    };

    // If the node has a parent (now correctly sourced), set its extent to 'parent'
    if (newNode.parentId) {
      newNode.extent = "parent";
    }

    newNodes.push(newNode);
  });
  console.log(
    "[App.tsx transformDataForFlow] Transformation complete. New nodes count:",
    newNodes.length
  );

  // Filter edges to ensure both source and target nodes exist in the newNodes list
  const newNodeIds = new Set(newNodes.map((n) => n.id));
  const newEdges = rawEdges.filter((edge) => {
    const sourceExists = newNodeIds.has(edge.source);
    const targetExists = newNodeIds.has(edge.target);
    if (!sourceExists)
      console.warn(
        `[App.tsx transformDataForFlow] Edge ${edge.id} source ${edge.source} missing in new nodes.`
      );
    if (!targetExists)
      console.warn(
        `[App.tsx transformDataForFlow] Edge ${edge.id} target ${edge.target} missing in new nodes.`
      );
    return sourceExists && targetExists;
  });
  console.log(
    "[App.tsx transformDataForFlow] Edges filtered. New edges count:",
    newEdges.length
  );

  return { nodes: newNodes, edges: newEdges };
};
// --- END: transformDataForFlow Function ---

// Inner component to handle React Flow instance and layout
const FlowCanvas: React.FC<{
  initialNodes: Node[];
  initialEdges: Edge[];
  settings: AnalysisSettings;
}> = ({ initialNodes, initialEdges, settings }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow(); // Hook for fitView

  // React Flow change handlers
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // Layout effect to run ELK when initial nodes/edges change
  useLayoutEffect(() => {
    console.log(
      "[Webview FlowCanvas] Layout effect triggered. Initial nodes count:",
      initialNodes.length
    );
    if (initialNodes.length > 0) {
      console.log("[Webview FlowCanvas] Running ELK layout...");
      getLayoutedElements(initialNodes, initialEdges)
        .then((layoutResult) => {
          // Check if the layout result is valid before destructuring
          if (layoutResult && layoutResult.nodes && layoutResult.edges) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = layoutResult;
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            // Use timeout to ensure layout is applied before fitting view
            window.requestAnimationFrame(() => {
              fitView({ duration: 300 }); // Smooth transition
            });
            console.log("[Webview] ELK layout applied.");
          } else {
            console.error("[Webview] ELK layout failed to return nodes/edges.");
          }
        })
        .catch((err) => console.error("[Webview] ELK layout error:", err));
    } else {
      // Clear nodes/edges if initial data is empty
      setNodes([]);
      setEdges([]);
    }
    // Depend on the raw initial data passed as props
  }, [initialNodes, initialEdges, fitView]);

  // Effect to update node/edge visibility based on settings
  // This runs *after* layouting and initial state setting
  useEffect(() => {
    console.log(
      "[Webview FlowCanvas] Settings or nodes/edges changed, updating visibility. Settings:",
      settings
    );
    // console.log("[Webview FlowCanvas] Current nodes for visibility update:", nodes);
    // console.log("[Webview FlowCanvas] Current edges for visibility update:", edges);

    let nodesChanged = false;
    const nextNodes = nodes.map((node) => {
      let newHidden = false;

      // Logic for ExportedItemNode (e.g., Hooks)
      if (
        node.type === "ExportedItemNode" &&
        node.data?.actualType === "Hook" &&
        !settings.showHooks
      ) {
        console.log(
          `[Webview FlowCanvas] Node ${node.id} (ExportedItem Hook) hidden due to showHooks: ${settings.showHooks}`
        );
        newHidden = true;
      }

      // Logic for LibraryContainerNode
      if (node.type === "LibraryContainerNode" && !settings.showLibDeps) {
        console.log(
          `[Webview FlowCanvas] Node ${node.id} (LibraryContainer) hidden due to showLibDeps: ${settings.showLibDeps}`
        );
        newHidden = true;
      }

      // Remove old LibDep logic (FileDep already removed from settings)
      // if (node.data?.type === "LibDep" && !settings.showLibDeps) { ... }

      if (node.hidden !== newHidden) {
        nodesChanged = true;
        // console.log(`[Webview FlowCanvas] Node ${node.id} visibility changed to ${newHidden}`);
        return { ...node, hidden: newHidden };
      }
      return node; // Return same instance if no change
    });

    let edgesChanged = false;
    const nextEdges = edges.map((edge) => {
      let newHidden = false;
      const sourceNode = nextNodes.find((n) => n.id === edge.source);
      const targetNode = nextNodes.find((n) => n.id === edge.target);

      if (sourceNode?.hidden || targetNode?.hidden) {
        // console.log(`[Webview FlowCanvas] Edge ${edge.id} hidden because source/target node (${sourceNode?.id}/${targetNode?.id}) is hidden.`);
        newHidden = true;
      } else {
        // Logic for edges connected to ExportedItemNode (Hooks)
        if (
          targetNode?.type === "ExportedItemNode" &&
          targetNode.data?.actualType === "Hook" &&
          !settings.showHooks
        ) {
          console.log(
            `[Webview FlowCanvas] Edge ${edge.id} to ExportedItem Hook ${targetNode.id} hidden due to showHooks: ${settings.showHooks}`
          );
          newHidden = true;
        }
        // Logic for edges connected to LibraryContainerNode
        // Also check sourceNode in case the edge direction is from a library (less common but possible)
        if (
          !newHidden &&
          targetNode?.type === "LibraryContainerNode" &&
          !settings.showLibDeps
        ) {
          console.log(
            `[Webview FlowCanvas] Edge ${edge.id} to LibraryContainer ${targetNode.id} hidden due to showLibDeps: ${settings.showLibDeps}`
          );
          newHidden = true;
        }
        if (
          !newHidden &&
          sourceNode?.type === "LibraryContainerNode" &&
          !settings.showLibDeps
        ) {
          console.log(
            `[Webview FlowCanvas] Edge ${edge.id} from LibraryContainer ${sourceNode.id} hidden due to showLibDeps: ${settings.showLibDeps}`
          );
          newHidden = true;
        }

        // Remove old LibDep edge logic
        // if (targetNode?.data?.type === "LibDep" && !settings.showLibDeps) { ... }
      }

      if (edge.hidden !== newHidden) {
        edgesChanged = true;
        // console.log(`[Webview FlowCanvas] Edge ${edge.id} visibility changed to ${newHidden}`);
        return { ...edge, hidden: newHidden };
      }
      return edge; // Return same instance if no change
    });

    if (nodesChanged) {
      // console.log("[Webview FlowCanvas] Applying node visibility changes:", nextNodes.filter(n => n.hidden).map(n => n.id));
      setNodes(nextNodes);
    }
    if (edgesChanged) {
      // console.log("[Webview FlowCanvas] Applying edge visibility changes:", nextEdges.filter(e => e.hidden).map(e => e.id));
      setEdges(nextEdges);
    }
  }, [settings, nodes, edges, setNodes, setEdges]);

  // Define nodeTypes mapping
  const nodeTypes = useMemo(
    () => ({
      ComponentNode: ComponentNodeDisplay, // This might become a more generic 'ExportedItemNode' or be part of it
      FileContainerNode: FileContainerNodeDisplay,
      LibraryContainerNode: LibraryContainerNodeDisplay,
      ExportedItemNode: ExportedItemNodeDisplay,
    }),
    []
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView // fitView is now called manually after layout
      nodeTypes={nodeTypes}
      defaultEdgeOptions={{
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.5 },
      }}
      // Add explicit background color for contrast if needed
      // style={{ backgroundColor: '#1e1e1e' }}
    >
      <Controls />
      {settings.showMinimap && (
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      )}
      <Background gap={12} size={1} />
      {/* Panel for layout buttons could be added here later */}
      {/* <Panel position="top-right"> ... </Panel> */}
    </ReactFlow>
  );
};
// --- End FlowCanvas ---

const App: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(
    window.initialData?.filePath || null
  );
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(
    window.initialWorkspaceRoot || null
  );
  const [rawAnalysisData, setRawAnalysisData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);
  const [treemapSettings, setTreemapSettings] = useState<TreemapSettings>(
    defaultTreemapSettings
  );

  const [activeView, setActiveView] = useState<
    "graph" | "treeview" | "treemap"
  >("treemap");
  const [scopeTreeData, setScopeTreeData] = useState<ScopeNode | null>(null);
  const [isTreemapLoading, setIsTreemapLoading] = useState<boolean>(false);
  const [treemapError, setTreemapError] = useState<string | null>(null);
  const [currentAnalysisTarget, setCurrentAnalysisTarget] = useState<
    string | null
  >(filePath);

  useEffect(() => {
    if (filePath && activeView === "treemap") {
      // Initial load, if treemap is default
      requestTreemapData(filePath);
    } else if (filePath && activeView === "graph") {
      // Or if graph is default
      requestGraphData(filePath);
    }
  }, []); // Run once on initial mount with initial filePath

  const requestGraphData = useCallback(
    (fp: string) => {
      if (!fp) return;
      vscodeApi.postMessage({ command: "analyzeDocument", text: fp });
      setIsLoading(true);
      setError(null);
      setScopeTreeData(null);
      setTreemapError(null);
      setCurrentAnalysisTarget(fp);
    },
    [vscodeApi]
  );

  const requestTreemapData = useCallback(
    (fp: string) => {
      if (!fp) return;
      vscodeApi.postMessage({ command: "getScopeTree", filePath: fp });
      setIsTreemapLoading(true);
      setTreemapError(null);
      setRawAnalysisData(null);
      setError(null);
      setCurrentAnalysisTarget(fp);
    },
    [vscodeApi]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log(
        "[Webview App] Received message:",
        message.command,
        message.filePath || ""
      );

      switch (message.command) {
        case "analysisResult":
          setRawAnalysisData(message.data);
          setIsLoading(false);
          setError(null);
          // setActiveView("graph"); // Comment out: let button clicks control active view
          break;
        case "analysisError":
          setError(message.error);
          setIsLoading(false);
          setRawAnalysisData(null);
          break;
        case "showScopeTree":
          setScopeTreeData(message.data);
          setIsTreemapLoading(false);
          setTreemapError(null);
          // setActiveView("treemap"); // Comment out: let button clicks control active view
          break;
        case "showScopeTreeError":
          setTreemapError(message.error);
          setIsTreemapLoading(false);
          setScopeTreeData(null);
          break;
        case "fileOpened":
          console.log("[Webview App] File opened event:", message.filePath);
          setFilePath(message.filePath); // Update filePath state
          // setCurrentAnalysisTarget(message.filePath); // This is set by request functions
          // Automatically trigger analysis for the new file based on the active view
          if (activeView === "treemap") {
            requestTreemapData(message.filePath);
          } else if (activeView === "graph") {
            requestGraphData(message.filePath);
          }
          // If other views, they should handle their data request or have a default
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [vscodeApi, activeView, requestGraphData, requestTreemapData]); // Added request functions to deps

  // ... handleSettingChange ...

  const HEADER_HEIGHT_PX = 50; // Example

  // Handler for Treemap settings changes
  const handleTreemapSettingChange = (
    settingName: keyof TreemapSettings,
    value: any
  ) => {
    setTreemapSettings((prevSettings) => ({
      ...prevSettings,
      [settingName]: value,
    }));
  };

  // Main return statement for the App component's JSX
  return (
    <SettingsContext.Provider value={settings}>
      <div className="app-container">
        <div className="left-panel">
          {/* ... existing left panel header ... */}
          {/* File Path Display/Input - Simplified */}
          <div style={{ marginBottom: "15px" }}>
            <label
              htmlFor="currentFileDisplay"
              style={{ display: "block", marginBottom: "5px" }}
            >
              Current File:
            </label>
            <input
              type="text"
              id="currentFileDisplay"
              readOnly
              value={currentAnalysisTarget || "No file selected"}
              style={{
                width: "100%",
                padding: "5px",
                boxSizing: "border-box",
                backgroundColor: "#3c3c3c",
                color: "#ccc",
                border: "1px solid #555",
              }}
            />
          </div>

          <h4>View Mode</h4>
          <div className="view-toggle">
            <button
              onClick={() => {
                setActiveView("graph");
                if (
                  currentAnalysisTarget &&
                  (!rawAnalysisData ||
                    currentAnalysisTarget !==
                      rawAnalysisData?.id?.split(":")[0])
                ) {
                  requestGraphData(currentAnalysisTarget);
                }
              }}
              className={activeView === "graph" ? "active" : ""}
            >
              Graph
            </button>
            <button
              onClick={() => {
                setActiveView("treemap");
                if (
                  currentAnalysisTarget &&
                  (!scopeTreeData || scopeTreeData.id !== currentAnalysisTarget)
                ) {
                  requestTreemapData(currentAnalysisTarget);
                }
              }}
              className={activeView === "treemap" ? "active" : ""}
            >
              Treemap
            </button>
          </div>

          {/* Treemap Specific Settings - Shown only when Treemap view is active */}
          {activeView === "treemap" && (
            <div className="settings-group" style={{ marginTop: "15px" }}>
              <h4>Treemap Settings</h4>
              <div className="setting-item">
                <label htmlFor="tile">Tiling Algorithm:</label>
                <select
                  id="tile"
                  value={treemapSettings.tile}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "tile",
                      e.target.value as TreemapSettings["tile"]
                    )
                  }
                >
                  <option value="squarify">Squarify</option>
                  <option value="binary">Binary</option>
                  <option value="dice">Dice</option>
                  <option value="slice">Slice</option>
                  <option value="sliceDice">SliceDice</option>
                </select>
              </div>
              <div className="setting-item">
                <label htmlFor="leavesOnly">Leaves Only:</label>
                <input
                  type="checkbox"
                  id="leavesOnly"
                  checked={treemapSettings.leavesOnly}
                  onChange={(e) =>
                    handleTreemapSettingChange("leavesOnly", e.target.checked)
                  }
                />
              </div>
              <div className="setting-item">
                <label htmlFor="enableLabel">Enable Labels:</label>
                <input
                  type="checkbox"
                  id="enableLabel"
                  checked={treemapSettings.enableLabel}
                  onChange={(e) =>
                    handleTreemapSettingChange("enableLabel", e.target.checked)
                  }
                />
              </div>
              <div className="setting-item">
                <label htmlFor="labelSkipSize">Label Skip Size:</label>
                <input
                  type="number"
                  id="labelSkipSize"
                  value={treemapSettings.labelSkipSize}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "labelSkipSize",
                      parseInt(e.target.value, 10)
                    )
                  }
                  min="0"
                />
              </div>
              <div className="setting-item">
                <label htmlFor="innerPadding">Inner Padding (px):</label>
                <input
                  type="number"
                  id="innerPadding"
                  value={treemapSettings.innerPadding}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "innerPadding",
                      parseInt(e.target.value, 10)
                    )
                  }
                  min="0"
                />
              </div>
              <div className="setting-item">
                <label htmlFor="outerPadding">Outer Padding (px):</label>
                <input
                  type="number"
                  id="outerPadding"
                  value={treemapSettings.outerPadding}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "outerPadding",
                      parseInt(e.target.value, 10)
                    )
                  }
                  min="0"
                />
              </div>
              <div className="setting-item">
                <label htmlFor="nodeOpacity">Node Opacity (0-1):</label>
                <input
                  type="number"
                  id="nodeOpacity"
                  value={treemapSettings.nodeOpacity}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "nodeOpacity",
                      parseFloat(e.target.value)
                    )
                  }
                  min="0"
                  max="1"
                  step="0.1"
                />
              </div>
              <div className="setting-item">
                <label htmlFor="borderWidth">Border Width (px):</label>
                <input
                  type="number"
                  id="borderWidth"
                  value={treemapSettings.borderWidth}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "borderWidth",
                      parseInt(e.target.value, 10)
                    )
                  }
                  min="0"
                />
              </div>
              <div className="setting-item">
                <label htmlFor="colorPalette">Color Palette:</label>
                <select
                  id="colorPalette"
                  value={treemapSettings.colorPalette}
                  onChange={(e) =>
                    handleTreemapSettingChange("colorPalette", e.target.value)
                  }
                >
                  {Object.keys(availablePalettes).map((paletteName) => (
                    <option key={paletteName} value={paletteName}>
                      {paletteName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Treemap Tooltip Settings - Shown only when Treemap view is active */}
          {activeView === "treemap" && (
            <div className="settings-group" style={{ marginTop: "10px" }}>
              <h5>Tooltip Settings</h5>
              <div className="setting-item-checkbox">
                <input
                  type="checkbox"
                  id="enableTooltip"
                  checked={treemapSettings.enableTooltip}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "enableTooltip",
                      e.target.checked
                    )
                  }
                />
                <label htmlFor="enableTooltip">Enable Tooltip</label>
              </div>
              <hr style={{ margin: "8px 0", borderColor: "#555" }} />
              <div className="setting-item-checkbox">
                <input
                  type="checkbox"
                  id="showTooltipId"
                  checked={treemapSettings.showTooltipId}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "showTooltipId",
                      e.target.checked
                    )
                  }
                  disabled={!treemapSettings.enableTooltip}
                />
                <label
                  htmlFor="showTooltipId"
                  style={{
                    color: treemapSettings.enableTooltip ? "inherit" : "#888",
                  }}
                >
                  Show ID
                </label>
              </div>
              <div className="setting-item-checkbox">
                <input
                  type="checkbox"
                  id="showTooltipCategory"
                  checked={treemapSettings.showTooltipCategory}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "showTooltipCategory",
                      e.target.checked
                    )
                  }
                  disabled={!treemapSettings.enableTooltip}
                />
                <label
                  htmlFor="showTooltipCategory"
                  style={{
                    color: treemapSettings.enableTooltip ? "inherit" : "#888",
                  }}
                >
                  Show Category
                </label>
              </div>
              <div className="setting-item-checkbox">
                <input
                  type="checkbox"
                  id="showTooltipValue"
                  checked={treemapSettings.showTooltipValue}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "showTooltipValue",
                      e.target.checked
                    )
                  }
                  disabled={!treemapSettings.enableTooltip}
                />
                <label
                  htmlFor="showTooltipValue"
                  style={{
                    color: treemapSettings.enableTooltip ? "inherit" : "#888",
                  }}
                >
                  Show Value
                </label>
              </div>
              <div className="setting-item-checkbox">
                <input
                  type="checkbox"
                  id="showTooltipLines"
                  checked={treemapSettings.showTooltipLines}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "showTooltipLines",
                      e.target.checked
                    )
                  }
                  disabled={!treemapSettings.enableTooltip}
                />
                <label
                  htmlFor="showTooltipLines"
                  style={{
                    color: treemapSettings.enableTooltip ? "inherit" : "#888",
                  }}
                >
                  Show Lines
                </label>
              </div>
              <div className="setting-item-checkbox">
                <input
                  type="checkbox"
                  id="showTooltipSourceSnippet"
                  checked={treemapSettings.showTooltipSourceSnippet}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "showTooltipSourceSnippet",
                      e.target.checked
                    )
                  }
                  disabled={!treemapSettings.enableTooltip}
                />
                <label
                  htmlFor="showTooltipSourceSnippet"
                  style={{
                    color: treemapSettings.enableTooltip ? "inherit" : "#888",
                  }}
                >
                  Show Source Snippet
                </label>
              </div>
              <div className="setting-item">
                <label
                  htmlFor="tooltipSourceSnippetLength"
                  style={{
                    color: treemapSettings.enableTooltip ? "inherit" : "#888",
                  }}
                >
                  Snippet Length:
                </label>
                <input
                  type="number"
                  id="tooltipSourceSnippetLength"
                  value={treemapSettings.tooltipSourceSnippetLength}
                  onChange={(e) =>
                    handleTreemapSettingChange(
                      "tooltipSourceSnippetLength",
                      parseInt(e.target.value, 10)
                    )
                  }
                  min="0"
                  max="1000" // Max length for snippet
                  disabled={
                    !treemapSettings.enableTooltip ||
                    !treemapSettings.showTooltipSourceSnippet
                  }
                />
              </div>
            </div>
          )}

          {/* Settings Popover and other controls from original App.tsx should be here */}
          {/* Make sure to re-integrate your settings popover and other controls from original App.tsx */}
        </div>

        <div
          className="right-panel"
          style={{ flex: 1, position: "relative", overflow: "hidden" }}
        >
          {isLoading && activeView === "graph" && (
            <div className="loading-overlay">
              Analyzing Dependencies for Graph...
            </div>
          )}
          {error && activeView === "graph" && (
            <div className="error-overlay">Graph Error: {error}</div>
          )}
          {isTreemapLoading && activeView === "treemap" && (
            <div className="loading-overlay">Generating Treemap...</div>
          )}
          {treemapError && activeView === "treemap" && (
            <div className="error-overlay">Treemap Error: {treemapError}</div>
          )}

          {activeView === "graph" && rawAnalysisData && (
            <ReactFlowProvider>
              {" "}
              {/* Ensure ReactFlowProvider wraps FlowCanvas */}
              <FlowCanvas
                initialNodes={rawAnalysisData.nodes}
                initialEdges={rawAnalysisData.edges}
                settings={settings}
              />
            </ReactFlowProvider>
          )}

          {activeView === "treemap" && scopeTreeData && (
            <div
              style={{
                width: "100%",
                height: "100%",
              }}
            >
              <TreemapDisplay data={scopeTreeData} settings={treemapSettings} />
            </div>
          )}

          {activeView === "treemap" &&
            !scopeTreeData &&
            !isTreemapLoading &&
            !treemapError && (
              <div className="placeholder-overlay">
                {currentAnalysisTarget
                  ? `Select/Re-select a file or click "Treemap" to generate for ${currentAnalysisTarget
                      .split("/")
                      .pop()}.`
                  : "Select a file to generate a treemap."}
              </div>
            )}

          {activeView === "graph" &&
            !rawAnalysisData &&
            !isLoading &&
            !error && (
              <div className="placeholder-overlay">
                {currentAnalysisTarget
                  ? `Select/Re-select a file or click "Graph" to generate for ${currentAnalysisTarget
                      .split("/")
                      .pop()}.`
                  : "Select a file to generate a graph."}
              </div>
            )}
        </div>
      </div>
    </SettingsContext.Provider>
  );
};

export default App;
