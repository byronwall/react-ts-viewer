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

// Import custom node components
import ComponentNodeDisplay from "./ComponentNodeDisplay";
// FileNodeDisplay and DependencyNodeDisplay will be removed
// import FileNodeDisplay from "./FileNodeDisplay";
// import DependencyNodeDisplay from "./DependencyNodeDisplay";

// Placeholder components for new node types
const FileContainerNodeDisplay: React.FC<NodeProps> = (props) => {
  console.log(
    "[Webview FlowCanvas] Rendering FileContainerNodeDisplay (placeholder) for node:",
    props.id,
    "Data:",
    props.data
  );
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid green",
        background: "#f0fff0",
        borderRadius: "5px",
      }}
    >
      <strong>File Container</strong>
      <br />
      ID: {props.id}
      <br />
      Label: {props.data?.label || "N/A"}
    </div>
  );
};

const LibraryContainerNodeDisplay: React.FC<NodeProps> = (props) => {
  console.log(
    "[Webview FlowCanvas] Rendering LibraryContainerNodeDisplay (placeholder) for node:",
    props.id,
    "Data:",
    props.data
  );
  return (
    <div
      style={{
        padding: 10,
        border: "1px solid orange",
        background: "#fff5e6",
        borderRadius: "5px",
      }}
    >
      <strong>Library Container</strong>
      <br />
      ID: {props.id}
      <br />
      Label: {props.data?.label || "N/A"}
    </div>
  );
};

const ExportedItemNodeDisplay: React.FC<NodeProps> = (props) => {
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
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "80",
  "elk.direction": "DOWN", // Default layout direction
  "elk.hierarchyHandling": "INCLUDE_CHILDREN", // Added for hierarchical layout
  // Consider adding options for padding within parent nodes if needed later
  // "elk.padding": "[top=20,left=20,bottom=20,right=20]",
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

  // Transform flat list of nodes with parentNode into a hierarchical structure for ELK
  const elkNodesMap = new Map();
  const rootElkNodes: any[] = []; // Using any[] for ELK node children temporarily

  nodes.forEach((node) => {
    const elkNode = {
      ...node,
      id: node.id, // Ensure id is correctly passed
      targetPosition: isHorizontal ? "left" : "top",
      sourcePosition: isHorizontal ? "right" : "bottom",
      width: node.width ?? nodeWidth,
      height: node.height ?? nodeHeight,
      children: [], // Initialize children array for potential parent nodes
      // layoutOptions for individual nodes can be set here if needed
    };
    elkNodesMap.set(node.id, elkNode);
  });

  nodes.forEach((node) => {
    const elkNode = elkNodesMap.get(node.id);
    if (node.parentNode && elkNodesMap.has(node.parentNode)) {
      const parentElkNode = elkNodesMap.get(node.parentNode);
      parentElkNode.children.push(elkNode);
      console.log(
        `[Webview getLayoutedElements] Node ${node.id} added as child to ${node.parentNode}`
      );
    } else {
      rootElkNodes.push(elkNode);
      if (node.parentNode) {
        console.warn(
          `[Webview getLayoutedElements] Node ${node.id} has parentNode ${node.parentNode} but parent not found in map. Adding as root.`
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

      // Recursive function to flatten hierarchy and adjust coordinates
      const processLayoutedNode = (
        elkNode: any,
        parentPosition: { x: number; y: number },
        parentId?: string
      ) => {
        const absoluteX = (elkNode.x ?? 0) + parentPosition.x;
        const absoluteY = (elkNode.y ?? 0) + parentPosition.y;

        // Find original node data to preserve other properties (like data, type, etc.)
        // elkNode from ELK might only have id, x, y, width, height, children, edges
        const originalNode = nodes.find((n) => n.id === elkNode.id);
        if (!originalNode) {
          console.warn(
            `[Webview getLayoutedElements] Original node not found for ELK node id ${elkNode.id}`
          );
          return; // Skip if no original node
        }

        const reactFlowNode: Node = {
          ...originalNode, // Spread original node properties first
          id: elkNode.id,
          position: { x: absoluteX, y: absoluteY },
          width: elkNode.width,
          height: elkNode.height,
          // Preserve parentNode relationship for React Flow if it was there
          // ELK children are processed recursively, original parentNode from input is what matters for React Flow
          parentNode: originalNode.parentNode,
        };
        finalLayoutedNodes.push(reactFlowNode);

        if (elkNode.children && elkNode.children.length > 0) {
          elkNode.children.forEach((childElkNode: any) => {
            processLayoutedNode(
              childElkNode,
              { x: absoluteX, y: absoluteY },
              elkNode.id
            );
          });
        }
      };

      // Start processing from root children of the layouted graph
      layoutedGraph.children.forEach((rootElkNode: any) => {
        processLayoutedNode(rootElkNode, { x: 0, y: 0 });
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
        case "showResults":
          console.log(
            "[Webview] Storing raw results for layout:",
            message.data
          );
          setIsLoading(false);
          // Store raw data; layout happens in FlowCanvas's effect
          setRawAnalysisData({
            nodes: message.data.nodes || [],
            edges: message.data.edges || [],
          });
          break;
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
