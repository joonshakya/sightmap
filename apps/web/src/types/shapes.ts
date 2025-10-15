export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  isEditing?: boolean;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface Arrow {
  id: string;
  type: "arrow";
  points: number[];
  stroke: string;
  isSnapped: boolean;
}

export type Shape = Rectangle | Arrow;

export interface MapData {
  shapes: Shape[];
  zoom: number;
}

export interface GridConfig {
  size: number;
  snapToGrid: boolean;
  visible: boolean;
}
