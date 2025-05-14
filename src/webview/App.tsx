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
import TreemapDisplay from "./TreemapDisplay";
import { vscodeApi } from "./vscodeApi";

// Import new settings components and types
import SettingsControl from "./SettingsControl";
import CollapsibleSection from "./CollapsibleSection";
import {
  TreemapSettings,
  treemapSettingsConfig,
  settingGroupOrder,
  defaultTreemapSettings as newDefaultTreemapSettings, // Renamed to avoid conflict
} from "./settingsConfig";

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

const LibraryContainerNodeDisplay: React.FC<CustomNodeProps> = (props) => {
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

const ExportedItemNodeDisplay: React.FC<CustomNodeProps> = (props) => {
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid purple",
        background: "#f3e7f3",
        borderRadius: "5px",
        width: props.width || nodeWidth,
        height: props.height || nodeHeight,
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
  showLibDeps: boolean;
}

const defaultSettings: AnalysisSettings = {
  maxDepth: 3,
  showMinimap: false,
  showHooks: true,
  showLibDeps: true,
};

// Use the imported defaultTreemapSettings
// const defaultTreemapSettings: TreemapSettings = { ... }; // Removed

export const SettingsContext =
  React.createContext<AnalysisSettings>(defaultSettings);

const elk = new ELK();

const elkOptions = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "80",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.padding": "[top=10,left=10,bottom=10,right=10]",
};

const nodeWidth = 172;
const nodeHeight = 100;

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
      height:
        node.data?.conceptualType === "FileContainer" ||
        node.data?.conceptualType === "LibraryContainer"
          ? 20
          : (node.height ?? nodeHeight),
      children: [],
    };
    elkNodesMap.set(node.id, elkNode);
  });

  nodes.forEach((node) => {
    const elkNode = elkNodesMap.get(node.id);
    if (node.parentId && elkNodesMap.has(node.parentId)) {
      const parentElkNode = elkNodesMap.get(node.parentId);
      parentElkNode.children.push(elkNode);
    } else {
      rootElkNodes.push(elkNode);
    }
  });

  const graph: any = {
    id: "root",
    layoutOptions: layoutOptions,
    children: rootElkNodes,
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
      const mapElkNodeToReactFlowNode = (
        elkNode: any,
        elkParentId?: string
      ) => {
        const originalNode = nodes.find((n) => n.id === elkNode.id);
        if (!originalNode) {
          return;
        }

        const rfNode: Node = {
          ...originalNode,
          id: elkNode.id,
          position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
          width: elkNode.width,
          height: elkNode.height,
        };

        if (elkParentId) {
          rfNode.parentId = elkParentId;
        } else {
          delete rfNode.parentId;
        }
        finalLayoutedNodes.push(rfNode);

        if (elkNode.children && elkNode.children.length > 0) {
          elkNode.children.forEach((childElkNode: any) => {
            mapElkNodeToReactFlowNode(childElkNode, elkNode.id);
          });
        }
      };
      layoutedGraph.children?.forEach((rootElkNode: any) => {
        mapElkNodeToReactFlowNode(rootElkNode);
      });
      return {
        nodes: finalLayoutedNodes,
        edges: edges,
      };
    })
    .catch((err) => {
      console.error("[Webview] ELK layout promise error:", err);
      return;
    });
};

const transformDataForFlow = (
  rawNodes: Node[],
  rawEdges: Edge[]
): { nodes: Node[]; edges: Edge[] } => {
  const newNodes: Node[] = [];
  console.log(
    "[App.tsx transformDataForFlow] Starting transformation. Raw nodes count:",
    rawNodes.length
  );

  rawNodes.forEach((rawNode) => {
    let flowNodeType: string | undefined;
    const dataPayload: any = { ...rawNode.data };
    let decisionType = rawNode.data?.type;
    if (
      !decisionType &&
      rawNode.type &&
      !["default", "input", "output", "group"].includes(rawNode.type)
    ) {
      decisionType = rawNode.type;
    }

    if (!decisionType) {
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
        return;
      }
    }

    if (!flowNodeType) {
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
          flowNodeType = "ComponentNode";
          dataPayload.conceptualType = "ExportedItem";
          dataPayload.actualType = "Component";
          break;
        case "Hook":
        case "Function":
        case "Variable":
          flowNodeType = "ExportedItemNode";
          dataPayload.conceptualType = "ExportedItem";
          dataPayload.actualType = decisionType;
          break;
        case "LibraryImport":
          flowNodeType = "ExportedItemNode";
          dataPayload.conceptualType = "LibraryImportItem";
          dataPayload.actualType = rawNode.data?.label || decisionType;
          break;
        case "HookUsage":
          return;
        default:
          if (
            [
              "FileContainerNode",
              "LibraryContainerNode",
              "ExportedItemNode",
              "ComponentNode",
            ].includes(decisionType ?? "")
          ) {
            flowNodeType = decisionType;
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
            if (rawNode.data?.label) {
              flowNodeType = "ExportedItemNode";
              dataPayload.conceptualType = "UnknownExport";
              dataPayload.actualType = String(decisionType);
            } else {
              return;
            }
          }
      }
    }

    if (!flowNodeType) {
      return;
    }

    let parentIdToAssign = rawNode.parentNode;
    if (
      flowNodeType === "FileContainerNode" ||
      flowNodeType === "LibraryContainerNode"
    ) {
      parentIdToAssign = undefined;
    }

    const newNode: Node = {
      ...rawNode,
      type: flowNodeType,
      data: dataPayload,
      parentId: parentIdToAssign,
      width: rawNode.width ?? nodeWidth,
      height: rawNode.height ?? nodeHeight,
    };
    if (newNode.parentId) {
      newNode.extent = "parent";
    }
    newNodes.push(newNode);
  });

  const newNodeIds = new Set(newNodes.map((n) => n.id));
  const newEdges = rawEdges.filter((edge) => {
    const sourceExists = newNodeIds.has(edge.source);
    const targetExists = newNodeIds.has(edge.target);
    return sourceExists && targetExists;
  });

  return { nodes: newNodes, edges: newEdges };
};

// Inner component to handle React Flow instance and layout
const FlowCanvas: React.FC<{
  initialNodes: Node[];
  initialEdges: Edge[];
  settings: AnalysisSettings;
}> = ({ initialNodes, initialEdges, settings }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();

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

  useLayoutEffect(() => {
    if (initialNodes.length > 0) {
      getLayoutedElements(initialNodes, initialEdges)
        .then((layoutResult) => {
          if (layoutResult && layoutResult.nodes && layoutResult.edges) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = layoutResult;
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            window.requestAnimationFrame(() => {
              fitView({ duration: 300 });
            });
          }
        })
        .catch((err) => console.error("[Webview] ELK layout error:", err));
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [initialNodes, initialEdges, fitView]);

  useEffect(() => {
    let nodesChanged = false;
    const nextNodes = nodes.map((node) => {
      let newHidden = false;
      if (
        node.type === "ExportedItemNode" &&
        node.data?.actualType === "Hook" &&
        !settings.showHooks
      ) {
        newHidden = true;
      }
      if (node.type === "LibraryContainerNode" && !settings.showLibDeps) {
        newHidden = true;
      }
      if (node.hidden !== newHidden) {
        nodesChanged = true;
        return { ...node, hidden: newHidden };
      }
      return node;
    });

    let edgesChanged = false;
    const nextEdges = edges.map((edge) => {
      let newHidden = false;
      const sourceNode = nextNodes.find((n) => n.id === edge.source);
      const targetNode = nextNodes.find((n) => n.id === edge.target);

      if (sourceNode?.hidden || targetNode?.hidden) {
        newHidden = true;
      } else {
        if (
          targetNode?.type === "ExportedItemNode" &&
          targetNode.data?.actualType === "Hook" &&
          !settings.showHooks
        ) {
          newHidden = true;
        }
        if (
          !newHidden &&
          targetNode?.type === "LibraryContainerNode" &&
          !settings.showLibDeps
        ) {
          newHidden = true;
        }
        if (
          !newHidden &&
          sourceNode?.type === "LibraryContainerNode" &&
          !settings.showLibDeps
        ) {
          newHidden = true;
        }
      }
      if (edge.hidden !== newHidden) {
        edgesChanged = true;
        return { ...edge, hidden: newHidden };
      }
      return edge;
    });

    if (nodesChanged) {
      setNodes(nextNodes);
    }
    if (edgesChanged) {
      setEdges(nextEdges);
    }
  }, [settings, nodes, edges, setNodes, setEdges]);

  const nodeTypes = useMemo(
    () => ({
      ComponentNode: ComponentNodeDisplay,
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
      nodeTypes={nodeTypes}
      defaultEdgeOptions={{
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.5 },
      }}
    >
      <Controls />
      {settings.showMinimap && (
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      )}
      <Background gap={12} size={1} />
    </ReactFlow>
  );
};

const HEADER_HEIGHT = 60; // Define header height

const App: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(
    window.initialData?.filePath || null
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(
    window.initialWorkspaceRoot || null
  );
  const [rawAnalysisData, setRawAnalysisData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(defaultSettings);

  const [treemapSettings, setTreemapSettings] = useState<TreemapSettings>(
    newDefaultTreemapSettings
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
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] =
    useState<boolean>(false);

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
      vscodeApi.postMessage({
        command: "getScopeTree",
        filePath: fp,
        options: {
          flattenTree: treemapSettings.enableNodeFlattening,
          flattenBlocks: treemapSettings.flattenBlocks,
          flattenArrowFunctions: treemapSettings.flattenArrowFunctions,
          createSyntheticGroups: treemapSettings.createSyntheticGroups,
          includeImports: treemapSettings.showImports,
          includeTypes: treemapSettings.showTypes,
          includeLiterals: treemapSettings.showLiterals,
        },
      });
      setIsTreemapLoading(true);
      setTreemapError(null);
      setRawAnalysisData(null);
      setError(null);
      setCurrentAnalysisTarget(fp);
    },
    [vscodeApi, treemapSettings]
  );

  useEffect(() => {
    if (filePath) {
      if (activeView === "treemap") {
        requestTreemapData(filePath);
      } else if (activeView === "graph") {
        requestGraphData(filePath);
      }
    }
  }, [filePath, activeView, requestGraphData, requestTreemapData]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case "analysisResult":
          setRawAnalysisData(message.data);
          setIsLoading(false);
          setError(null);
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
          break;
        case "showScopeTreeError":
          setTreemapError(message.error);
          setIsTreemapLoading(false);
          setScopeTreeData(null);
          break;
        case "fileOpened":
          setFilePath(message.filePath);
          if (activeView === "treemap") {
            requestTreemapData(message.filePath);
          } else if (activeView === "graph") {
            requestGraphData(message.filePath);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeView, requestGraphData, requestTreemapData, vscodeApi]); // Added vscodeApi just in case, though it's stable

  const handleTreemapSettingChange = (
    settingName: keyof TreemapSettings,
    value: any
  ) => {
    setTreemapSettings((prevSettings) => ({
      ...prevSettings,
      [settingName]: value,
    }));
  };

  useEffect(() => {
    if (activeView === "treemap" && currentAnalysisTarget) {
      // Debounce or ensure this doesn't fire excessively if settings change rapidly
      // For now, direct refetch:
      requestTreemapData(currentAnalysisTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Dependencies that trigger re-fetch for treemap structure
    treemapSettings.enableNodeFlattening,
    treemapSettings.flattenBlocks,
    treemapSettings.flattenArrowFunctions,
    treemapSettings.createSyntheticGroups,
    treemapSettings.showImports,
    treemapSettings.showTypes,
    treemapSettings.showLiterals,
    // requestTreemapData itself depends on treemapSettings, so including it here
    // along with activeView and currentAnalysisTarget ensures correctness.
    activeView,
    currentAnalysisTarget,
    requestTreemapData,
  ]);

  const renderTreemapSettings = () => {
    return settingGroupOrder.map((groupName) => {
      const settingsInGroup = treemapSettingsConfig.filter(
        (s) => s.group === groupName
      );
      if (settingsInGroup.length === 0) return null;

      const defaultOpenGroup =
        groupName === "Treemap Display" ||
        groupName === "Node Visibility" ||
        groupName === "Node Structure";

      return (
        <CollapsibleSection
          title={groupName}
          key={groupName}
          defaultOpen={defaultOpenGroup}
        >
          {settingsInGroup.map((config) => (
            <SettingsControl
              key={config.id}
              config={config}
              currentSettings={treemapSettings}
              onChange={handleTreemapSettingChange}
            />
          ))}
        </CollapsibleSection>
      );
    });
  };

  const currentFileName = currentAnalysisTarget
    ? currentAnalysisTarget.split("/").pop()
    : "No file";

  return (
    <SettingsContext.Provider value={settings}>
      <div
        className="app-container"
        style={{ display: "flex", flexDirection: "column", height: "100vh" }}
      >
        {/* Main Header / Toolbar */}
        <div
          className="main-header"
          style={{
            height: `${activeView === "treemap" ? 0 : HEADER_HEIGHT}px`, // Set to 0 for treemap view
            backgroundColor: "#252526",
            color: "#ccc",
            display: "flex",
            alignItems: "center",
            padding: `${activeView === "treemap" ? "0" : "0 15px"}`,
            borderBottom: `${activeView === "treemap" ? "none" : "1px solid #3a3a3a"}`,
            flexShrink: 0,
            justifyContent: "space-between",
            overflow: "hidden", // Hide content if height is 0
          }}
        >
          {/* Left Section: View Title */}
          <div style={{ fontSize: "1.1em", fontWeight: 500 }}>
            {/* Content removed, header might be empty or show other global app info if any */}
            {activeView === "graph" && (
              <>
                Graph:{" "}
                <span style={{ color: "#ddd", fontStyle: "italic" }}>
                  {currentFileName || "No file"}
                </span>
              </>
            )}
          </div>

          {/* Right Section: Action Buttons & Settings Cog */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Placeholder View-Specific Action Buttons (e.g., from TreemapDisplay) */}
            {/* activeView === "treemap" && (
              <>
                <button
                  className="action-button-placeholder"
                  title="Export as JSON"
                >
                  Export JSON
                </button>
                <button
                  className="action-button-placeholder"
                  title="Export as PNG"
                >
                  Export PNG
                </button>
                <button
                  className="action-button-placeholder"
                  title="Show Legend"
                >
                  Show Legend
                </button>
              </>
            ) */}
            {/* Add similar placeholders for graph view if needed */}

            {/* Settings Toggle Button - REMOVED FROM HERE */}
            {/* <button
              onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
              title={isSettingsPanelOpen ? "Hide Settings" : "Show Settings"}
              style={{
                marginLeft: "15px",
                padding: "8px",
                backgroundColor: isSettingsPanelOpen ? "#0056b3" : "#007bff",
                color: "white",
                border: isSettingsPanelOpen
                  ? "2px solid #ffc107"
                  : "2px solid transparent", // Gold border when open
                borderRadius: "50%",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.2s, border-color 0.2s",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.68,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button> */}
          </div>
        </div>

        {/* Main Content and Settings Panel Wrapper */}
        <div style={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {/* Main Content Panel */}
          <div
            className="main-content-panel"
            style={{
              flexGrow: 1,
              position: "relative",
              overflow: "auto", // Allow content within to scroll
              height: "100%",
              backgroundColor: "#121212",
            }}
          >
            {/* ... loading states and view rendering (Graph/Treemap) ... */}
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
                <FlowCanvas
                  initialNodes={rawAnalysisData.nodes}
                  initialEdges={rawAnalysisData.edges}
                  settings={settings}
                />
              </ReactFlowProvider>
            )}

            {activeView === "treemap" && scopeTreeData && (
              <div style={{ width: "100%", height: "100%" }}>
                <TreemapDisplay
                  data={scopeTreeData}
                  settings={treemapSettings}
                  onSettingsChange={handleTreemapSettingChange}
                  isSettingsPanelOpen={isSettingsPanelOpen}
                  onToggleSettingsPanel={() =>
                    setIsSettingsPanelOpen(!isSettingsPanelOpen)
                  }
                  fileName={currentFileName || "No file selected"}
                />
              </div>
            )}
            {/* ... placeholder overlays ... */}
            {activeView === "treemap" &&
              !scopeTreeData &&
              !isTreemapLoading &&
              !treemapError && (
                <div className="placeholder-overlay">
                  {currentAnalysisTarget
                    ? `Select/Re-select a file or click "Treemap" to generate for ${currentFileName}.`
                    : "Select a file to generate a treemap."}
                </div>
              )}

            {activeView === "graph" &&
              !rawAnalysisData &&
              !isLoading &&
              !error && (
                <div className="placeholder-overlay">
                  {currentAnalysisTarget
                    ? `Select/Re-select a file or click "Graph" to generate for ${currentFileName}.`
                    : "Select a file to generate a graph."}
                </div>
              )}
          </div>

          {/* Settings Panel (Right Side) */}
          <div
            className="settings-panel-right"
            style={{
              width: isSettingsPanelOpen ? "320px" : "0px", // Control width for transition
              minWidth: isSettingsPanelOpen ? "320px" : "0px", // Ensure it doesn't collapse too early
              transform: isSettingsPanelOpen
                ? "translateX(0)"
                : "translateX(100%)",
              transition:
                "transform 0.3s ease-in-out, width 0.3s ease-in-out, min-width 0.3s ease-in-out",
              right: 0,
              zIndex: 999,
              overflowY: "auto",
              overflowX: "hidden", // Prevent horizontal scrollbar during transition
              backgroundColor: "#1e1e1e",
              borderLeft: isSettingsPanelOpen ? "1px solid #333" : "none",
              padding: isSettingsPanelOpen ? "15px" : "0px",
              height: "100%",
              flexShrink: 0,
              visibility: isSettingsPanelOpen ? "visible" : "hidden", // Use visibility for better transition
            }}
          >
            {/* Current File Input - Moved here */}
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="currentFileDisplaySettings" // Unique ID
                style={{
                  display: "block",
                  marginBottom: "5px",
                  color: "#bbb",
                  fontSize: "0.9em",
                  fontWeight: 500,
                }}
              >
                Analysis Target:
              </label>
              <input
                type="text"
                id="currentFileDisplaySettings"
                readOnly
                value={currentAnalysisTarget || "No file selected"}
                title={currentAnalysisTarget || "No file selected"}
                style={{
                  width: "100%",
                  padding: "8px",
                  boxSizing: "border-box",
                  backgroundColor: "#2e2e2e",
                  color: "#ddd",
                  border: "1px solid #4a4a4a",
                  borderRadius: "4px",
                  fontSize: "0.9em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              />
            </div>

            {/* View Mode Toggles - Moved here */}
            <h5
              style={{
                marginTop: "0px",
                marginBottom: "10px",
                color: "#bbb",
                borderBottom: "1px solid #444",
                paddingBottom: "8px",
              }}
            >
              View Mode
            </h5>
            <div className="view-toggle" style={{ marginBottom: "20px" }}>
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
                title="Switch to Graph View"
              >
                Graph
              </button>
              <button
                onClick={() => {
                  setActiveView("treemap");
                  if (
                    currentAnalysisTarget &&
                    (!scopeTreeData ||
                      scopeTreeData.id !== currentAnalysisTarget)
                  ) {
                    requestTreemapData(currentAnalysisTarget);
                  }
                }}
                className={activeView === "treemap" ? "active" : ""}
                title="Switch to Treemap View"
              >
                Treemap
              </button>
            </div>

            {/* Settings Sections */}
            {activeView === "treemap" && (
              <div>
                <h5
                  style={{
                    marginBottom: "10px",
                    color: "#bbb",
                    borderBottom: "1px solid #444",
                    paddingBottom: "8px",
                  }}
                >
                  Treemap Settings
                </h5>
                {renderTreemapSettings()}
              </div>
            )}
            {activeView === "graph" && (
              <div>
                <h5
                  style={{
                    marginBottom: "10px",
                    color: "#bbb",
                    borderBottom: "1px solid #444",
                    paddingBottom: "8px",
                  }}
                >
                  Graph Settings
                </h5>
                <CollapsibleSection title="Graph Display" defaultOpen={true}>
                  <div style={{ paddingLeft: "0px", marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.showMinimap}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            showMinimap: e.target.checked,
                          }))
                        }
                        style={{ marginRight: "8px", accentColor: "#007bff" }}
                      />
                      <span
                        style={{
                          color: "#ddd",
                          verticalAlign: "middle",
                          fontSize: "0.9em",
                          fontWeight: 500,
                        }}
                      >
                        Show Minimap
                      </span>
                    </label>
                  </div>
                  <div style={{ paddingLeft: "0px", marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.showHooks}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            showHooks: e.target.checked,
                          }))
                        }
                        style={{ marginRight: "8px", accentColor: "#007bff" }}
                      />
                      <span
                        style={{
                          color: "#ddd",
                          verticalAlign: "middle",
                          fontSize: "0.9em",
                          fontWeight: 500,
                        }}
                      >
                        Show Hooks
                      </span>
                    </label>
                  </div>
                  <div style={{ paddingLeft: "0px", marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.showLibDeps}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            showLibDeps: e.target.checked,
                          }))
                        }
                        style={{ marginRight: "8px", accentColor: "#007bff" }}
                      />
                      <span
                        style={{
                          color: "#ddd",
                          verticalAlign: "middle",
                          fontSize: "0.9em",
                          fontWeight: 500,
                        }}
                      >
                        Show Library Dependencies
                      </span>
                    </label>
                  </div>
                </CollapsibleSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </SettingsContext.Provider>
  );
};

export default App;

// Basic styles for placeholder buttons, assuming App.css might not be directly editable by me
// Or these could be inline styles if preferred
const placeholderStyles = `
.action-button-placeholder {
  background-color: #4a4a4a;
  color: #ddd;
  border: 1px solid #555;
  padding: 6px 12px;
  margin-left: 8px;
  border-radius: 4px;
  font-size: 0.85em;
  cursor: default; /* Indicates they are placeholders */
}
.action-button-placeholder:hover {
  background-color: #5a5a5a;
}
`;

// Inject styles if not already present - this is a bit of a hack for webview environments
// In a typical React app, you'd put this in a CSS file.
if (!document.getElementById("placeholder-button-styles")) {
  const styleSheet = document.createElement("style");
  styleSheet.id = "placeholder-button-styles";
  styleSheet.type = "text/css";
  styleSheet.innerText = placeholderStyles;
  document.head.appendChild(styleSheet);
}
