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
import TreeView from "./TreeView"; // Import the TreeView component

// Import custom node components
import ComponentNodeDisplay from "./ComponentNodeDisplay";
import FileNodeDisplay from "./FileNodeDisplay";
import DependencyNodeDisplay from "./DependencyNodeDisplay";

// Declare the global vscode object provided by the inline script in getWebviewContent.ts
declare const vscode: {
  getState: () => any;
  setState: (state: any) => void;
  postMessage: (message: any) => void;
};

// Interface for settings managed by the App
interface AnalysisSettings {
  maxDepth: number;
  showMinimap: boolean;
  showHooks: boolean;
  showFileDeps: boolean;
  showLibDeps: boolean;
}

// Initial default settings (moved before context creation)
const defaultSettings: AnalysisSettings = {
  maxDepth: 3,
  showMinimap: true,
  showHooks: true, // Default to showing
  showFileDeps: true, // Default to showing
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
  const layoutOptions = { ...elkOptions, ...options };
  const isHorizontal = layoutOptions["elk.direction"] === "RIGHT";
  const graph: any = {
    // Use any temporarily for the graph type to avoid deep ELK type issues
    id: "root",
    layoutOptions: layoutOptions,
    children: nodes.map((node) => ({
      ...node,
      targetPosition: isHorizontal ? "left" : "top",
      sourcePosition: isHorizontal ? "right" : "bottom",
      width: node.width ?? nodeWidth,
      height: node.height ?? nodeHeight,
    })),
    // Map React Flow edges to ELK edges format (sources/targets arrays)
    edges: edges.map((edge) => ({
      ...edge,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  return elk
    .layout(graph)
    .then((layoutedGraph) => {
      // Check if layoutedGraph and children exist
      if (!layoutedGraph || !layoutedGraph.children) {
        console.error(
          "[Webview] ELK layout failed: No graph or children returned."
        );
        return; // Return void if layout failed
      }
      return {
        nodes: layoutedGraph.children.map((node: any) => ({
          // Use any for node type from ELK result
          ...node,
          position: { x: node.x, y: node.y },
        })),
        // Return the original edges, ELK doesn't modify edge structure in the return
        // unless specific options are used (like bendpoints)
        edges: edges,
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
    if (initialNodes.length > 0) {
      console.log("[Webview] Running ELK layout...");
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
    console.log("[Webview] Updating nodes/edges visibility based on settings");
    let nodesChanged = false;
    const nextNodes = nodes.map((node) => {
      let newHidden = false;
      if (node.data?.type === "FileDep" && !settings.showFileDeps) {
        newHidden = true;
      }
      if (node.data?.type === "LibDep" && !settings.showLibDeps) {
        newHidden = true;
      }
      if (node.hidden !== newHidden) {
        nodesChanged = true;
        return { ...node, hidden: newHidden };
      }
      return node; // Return same instance if no change
    });

    // Update edges based on the visibility of the potentially updated nodes
    let edgesChanged = false;
    const nextEdges = edges.map((edge) => {
      let newHidden = false;
      // Find nodes in the *current potentially updated* list (nextNodes)
      const sourceNode = nextNodes.find((n) => n.id === edge.source);
      const targetNode = nextNodes.find((n) => n.id === edge.target);

      // Check if the source or target node is now hidden
      if (sourceNode?.hidden || targetNode?.hidden) {
        newHidden = true;
      } else {
        // Specifically hide dependency edges if their type is toggled off
        if (sourceNode?.data?.type === "Component") {
          if (targetNode?.data?.type === "FileDep" && !settings.showFileDeps) {
            newHidden = true;
          }
          if (targetNode?.data?.type === "LibDep" && !settings.showLibDeps) {
            newHidden = true;
          }
        }
        // Add other edge hiding logic if needed
      }

      if (edge.hidden !== newHidden) {
        edgesChanged = true;
        return { ...edge, hidden: newHidden };
      }
      return edge; // Return same instance if no change
    });

    // Only update state if necessary to prevent loops
    if (nodesChanged) {
      setNodes(nextNodes);
    }
    if (edgesChanged) {
      setEdges(nextEdges);
    }
  }, [settings, nodes, edges]); // Re-run when settings or the base nodes/edges change

  // Define nodeTypes mapping
  const nodeTypes = useMemo(
    () => ({
      ComponentNode: ComponentNodeDisplay,
      FileNode: FileNodeDisplay,
      DependencyNode: DependencyNodeDisplay,
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
  // State to hold raw results from extension before layouting
  const [rawAnalysisData, setRawAnalysisData] = useState<{
    nodes: Node[];
    edges: Edge[];
  }>({ nodes: [], edges: [] });

  // Load initial state and settings from VS Code state API
  useEffect(() => {
    const state = vscode.getState();
    if (state?.filePath) {
      console.log("[Webview] Restoring state with file path:", state.filePath);
      setTargetFile(state.filePath);
      // Optionally restore previous settings if saved
      // if (state.settings) setSettings(state.settings);
    }
    // Trigger analysis automatically if a file path is present on load
    if (state?.filePath) {
      runAnalysis(state.filePath, settings);
    }
  }, []);

  // Update VS Code state when targetFile or settings change
  useEffect(() => {
    console.log("[Webview] Saving state:", { filePath: targetFile, settings });
    vscode.setState({ filePath: targetFile, settings });
  }, [targetFile, settings]);

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
      vscode.postMessage({
        command: "runAnalysis",
        filePath: filePath,
        settings: currentSettings, // Send current settings
      });
    },
    [] // No dependencies needed as vscode is stable
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

                  {/* Show File Dependencies Checkbox */}
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
            <input
              type="text"
              id="targetFile"
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
              }}
            />

            {/* Separator */}
            <hr
              style={{
                width: "100%",
                borderTop: "1px solid #444",
                margin: "15px 0",
                flexShrink: 0,
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
          <div style={{ flexGrow: 1, height: "100%" }}>
            {/* Pass raw data and settings to the inner component */}
            <FlowCanvas
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
