import * as React from "react";
import {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
import ReactFlow, {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  EdgeChange,
  NodeChange,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  NodeProps,
} from "reactflow";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  PopoverBackdrop,
} from "@headlessui/react";
import { Gear } from "@phosphor-icons/react"; // Import the Gear icon

import "reactflow/dist/style.css";
import "@reactflow/minimap/dist/style.css";
import "@reactflow/controls/dist/style.css";
import "./App.css";
import TreeView, { vscodeApi } from "./TreeView"; // Import vscodeApi

// Explicitly type CustomNodeProps to include width and height
interface CustomNodeProps extends NodeProps {
  width?: number;
  height?: number;
}

// Import custom node components
import ComponentNodeDisplay from "./ComponentNodeDisplay";
// FileNodeDisplay and DependencyNodeDisplay will be removed
// import FileNodeDisplay from "./FileNodeDisplay";
// import DependencyNodeDisplay from "./DependencyNodeDisplay";

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

// Declare the injected global variable (keep this for initial data)
declare global {
  interface Window {
    initialData?: { filePath?: string };
    initialWorkspaceRoot?: string;
  }
}

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
  // State moved: nodes, edges, onNodesChange, onEdgesChange are now in FlowCanvas
  const [targetFile, setTargetFile] = useState<string>("");
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | undefined>(
    undefined
  );
  // State to hold raw results from extension before layouting
  const [rawAnalysisData, setRawAnalysisData] = useState<{
    nodes: Node[];
    edges: Edge[];
  }>({ nodes: [], edges: [] });

  // --- Initialization Effect ---
  useEffect(() => {
    let initialFile = "";
    // Read initial data from window object
    if (window.initialData?.filePath) {
      console.log(
        "[Webview] Reading initial file path from window:",
        window.initialData.filePath
      );
      initialFile = window.initialData.filePath;
      setTargetFile(initialFile);
    } else {
      console.warn("[Webview] Initial file path not found on window object.");
    }

    if (window.initialWorkspaceRoot) {
      console.log(
        "[Webview] Reading initial workspace root from window:",
        window.initialWorkspaceRoot
      );
      setWorkspaceRoot(window.initialWorkspaceRoot);
    } else {
      console.warn(
        "[Webview] Initial workspace root not found on window object."
      );
    }

    // Removed state restoration via vscode.getState()
    // If state persistence is needed, it must be requested from the extension via postMessage

    // Trigger analysis automatically if a file path was found
    if (initialFile) {
      // Need to pass initial settings directly as state might not be updated yet
      runAnalysis(initialFile, defaultSettings);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Function to send analysis request to extension
  const runAnalysis = useCallback(
    (filePath: string, currentSettings: AnalysisSettings) => {
      if (!filePath) {
        console.warn("[Webview] runAnalysis called with empty filePath");
        return;
      }
      console.log(
        `[Webview] Requesting analysis for: ${filePath} with settings:`,
        currentSettings
      );
      setIsLoading(true);
      // Use the imported vscodeApi
      vscodeApi.postMessage({
        command: "runAnalysis",
        filePath: filePath,
        settings: currentSettings,
      });
    },
    [] // Dependency array is correct, vscodeApi is stable module-level const
  );

  // Handle messages from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data; // The json data that the extension sent
      console.log("[Webview] Received message:", message);
      switch (message.command) {
        case "setFile":
          console.log("[Webview] Setting file path:", message.filePath);
          setTargetFile(message.filePath);
          // Automatically run analysis when file is set from extension
          // Ensure we use the *current* settings state
          setSettings((currentSettings) => {
            runAnalysis(message.filePath, currentSettings);
            return currentSettings; // No change to settings needed here
          });
          break;
        case "showResults": {
          console.log(
            "[Webview] Received raw results from extension:", // Log original
            message.data
          );
          setIsLoading(false);
          // Apply transformation
          const transformedData = transformDataForFlow(
            message.data.nodes || [],
            message.data.edges || []
          );
          console.log(
            "[Webview] Storing TRANSFORMED results for layout:", // Log transformed
            transformedData
          );
          // Store raw data; layout happens in FlowCanvas's effect
          setRawAnalysisData(transformedData); // Store transformed data
          break;
        }
        // Add other message handlers if needed
      }
    };

    window.addEventListener("message", handleMessage);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [runAnalysis]); // Removed settings dependency, handled within setFile logic

  // Handle settings changes
  const handleSettingChange = (
    settingName: keyof AnalysisSettings,
    value: any
  ) => {
    setSettings((prev) => {
      const newSettings = { ...prev, [settingName]: value };
      // TODO: Update node/edge visibility based on the *new* settings
      // Maybe trigger a re-filter/update of hidden props here?
      return newSettings;
    });
  };

  // Visibility update useEffect is now inside FlowCanvas

  // nodeTypes is now inside FlowCanvas

  return (
    // Wrap the entire app in the SettingsContext Provider
    <SettingsContext.Provider value={settings}>
      {/* Wrap the layout part in ReactFlowProvider */}
      <ReactFlowProvider>
        <div style={{ height: "100vh", width: "100vw", display: "flex" }}>
          {/* Left Panel (Controls + Tree View) */}
          <div
            className="left-panel"
            style={{
              width: "300px", // Increased width slightly
              padding: "10px",
              borderRight: "1px solid #444",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#252526", // VS Code dark theme background
              color: "#ccc", // Light text color
              position: "relative", // Needed for popover positioning
              overflowY: "auto", // Make panel scrollable
            }}
          >
            <div
              className="panel-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "15px" }}>
                Analysis Controls
              </h3>
              {/* Headless UI Popover for Settings */}
              <Popover className="relative settings-popover-container">
                <PopoverButton className="settings-button">
                  {/* SVG Cog Icon */}
                  {/* <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg> */}
                  <Gear size={20} /> {/* Use Phosphor Gear icon */}
                </PopoverButton>
                {/* Optional backdrop */}
                {/* <PopoverBackdrop className="fixed inset-0 bg-black/15" /> */}
                <PopoverPanel
                  anchor="bottom end"
                  className="settings-popover-panel"
                >
                  {/* Moved Settings Content Here */}
                  <h4>Analysis Settings</h4>

                  {/* Max Depth Input */}
                  <label
                    htmlFor="maxDepth"
                    style={{ marginBottom: "5px", display: "block" }}
                  >
                    Max Depth:
                  </label>
                  <input
                    type="number"
                    id="maxDepth"
                    value={settings.maxDepth}
                    onChange={(e) =>
                      handleSettingChange(
                        "maxDepth",
                        parseInt(e.target.value, 10) || 1
                      )
                    }
                    min="1"
                    max="10" // Reasonable max
                  />

                  {/* Show Minimap Checkbox */}
                  <div>
                    <input
                      type="checkbox"
                      id="showMinimap"
                      checked={settings.showMinimap}
                      onChange={(e) =>
                        handleSettingChange("showMinimap", e.target.checked)
                      }
                    />
                    <label htmlFor="showMinimap">Show Minimap</label>
                  </div>

                  {/* Show Hooks Checkbox */}
                  <div>
                    <input
                      type="checkbox"
                      id="showHooks"
                      checked={settings.showHooks}
                      onChange={(e) =>
                        handleSettingChange("showHooks", e.target.checked)
                      }
                    />
                    <label htmlFor="showHooks">Show Hooks</label>
                  </div>

                  {/* Show File Dependencies Checkbox - TO BE REMOVED */}
                  {/*
                  <div>
                    <input
                      type="checkbox"
                      id="showFileDeps"
                      checked={settings.showFileDeps}
                      onChange={(e) =>
                        handleSettingChange("showFileDeps", e.target.checked)
                      }
                    />
                    <label htmlFor="showFileDeps">Show File Dependencies</label>
                  </div>
                  */}

                  {/* Show Library Dependencies Checkbox */}
                  <div>
                    <input
                      type="checkbox"
                      id="showLibDeps"
                      checked={settings.showLibDeps}
                      onChange={(e) =>
                        handleSettingChange("showLibDeps", e.target.checked)
                      }
                    />
                    <label htmlFor="showLibDeps">
                      Show Library Dependencies
                    </label>
                  </div>

                  {/* You might need a close button if not using backdrop click-away */}
                  {/* <button onClick={() => close()}>Close</button> */}
                </PopoverPanel>
              </Popover>
            </div>

            {/* Target File Input */}
            <label
              htmlFor="targetFile"
              style={{ marginBottom: "5px", flexShrink: 0 }}
            >
              Target File:
            </label>
            <textarea
              id="targetFile"
              rows={3} // Set the number of visible rows
              value={targetFile}
              onChange={(e) => setTargetFile(e.target.value)}
              placeholder="/path/to/your/component.tsx"
              style={{
                marginBottom: "15px",
                width: "100%",
                padding: "5px",
                backgroundColor: "#3c3c3c",
                color: "#ccc",
                border: "1px solid #555",
                boxSizing: "border-box", // Include padding in width
                flexShrink: 0,
                resize: "vertical", // Allow vertical resizing
              }}
            />

            {/* Tree View Panel */}
            <div
              style={{
                flexGrow: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {" "}
              {/* Container for TreeView */}
              <h3 style={{ marginTop: 0, marginBottom: "15px", flexShrink: 0 }}>
                Structure View
              </h3>
              {/* Render the TreeView component */}
              <div style={{ flexGrow: 1 }}>
                {" "}
                {/* Allows TreeView content to scroll */}
                <TreeView
                  nodes={rawAnalysisData.nodes}
                  edges={rawAnalysisData.edges}
                  workspaceRoot={workspaceRoot}
                />
              </div>
            </div>

            {/* Run Analysis Button */}
            <button
              onClick={() => runAnalysis(targetFile, settings)}
              disabled={isLoading || !targetFile}
              style={{
                marginTop: "15px", // Add some space above the button
                padding: "8px 15px",
                cursor: "pointer",
                backgroundColor: isLoading ? "#555" : "#0e639c",
                color: "white",
                border: "none",
                borderRadius: "3px",
                opacity: !targetFile ? 0.6 : 1,
                flexShrink: 0, // Prevent button from shrinking
              }}
            >
              {isLoading ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>

          {/* React Flow Canvas Area */}
          <div
            className="right-panel"
            style={{ flex: 1, position: "relative", overflow: "hidden" }}
          >
            {isLoading && (
              <div className="loading-overlay">Analyzing... Please wait.</div>
            )}
            <FlowCanvas
              // Pass the raw data, FlowCanvas handles layout
              initialNodes={rawAnalysisData.nodes}
              initialEdges={rawAnalysisData.edges}
              settings={settings}
            />
          </div>
        </div>
      </ReactFlowProvider>
    </SettingsContext.Provider>
  );
};

export default App;
