export interface ELKLayoutNode {
  id: string;
  width: number;
  height: number;
  x?: number; // Set by ELK after layout
  y?: number; // Set by ELK after layout
  children?: ELKLayoutNode[];
  /** Optional pre-rendered label(s) coming from ELK */
  labels?: { text: string }[];
  layoutOptions?: { [key: string]: any };
}
export interface ELKGraph {
  id: string;
  children: ELKLayoutNode[];
  edges: ELKLayoutEdge[];
  layoutOptions: { [key: string]: any };
}
interface ELKLayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
}
