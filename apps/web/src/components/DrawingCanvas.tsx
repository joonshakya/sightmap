import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Square,
  ArrowRight,
  Hand,
  Save,
  Grid,
  Magnet,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  Stage,
  Layer,
  Rect,
  Arrow,
  Text,
  Line,
  Transformer,
} from "react-konva";
import type {
  Shape,
  Rectangle,
  Arrow as ArrowType,
  MapData,
  GridConfig,
} from "@/types/shapes";
import cuid from "cuid";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as StageType } from "konva/lib/Stage";

interface DrawingCanvasProps {
  initialData?: MapData;
  onSave?: (data: MapData) => void;
}

const GRID_SIZE = 20;

const INITIAL_CANVAS_WIDTH = window.innerWidth;
const INITIAL_CANVAS_HEIGHT = window.innerHeight;
const CANVAS_EXPAND_MARGIN = 100; // px from edge to trigger expansion
const CANVAS_EXPAND_AMOUNT = 500; // px to expand each time

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  initialData,
  onSave,
}) => {
  const stageRef = useRef<StageType>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] =
    useState<Partial<Shape> | null>(null);
  const [tool, setTool] = useState<"rectangle" | "arrow" | "pan">(
    "rectangle"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialData?.zoom || 1);
  const [canvasSize, setCanvasSize] = useState({
    width: INITIAL_CANVAS_WIDTH,
    height: INITIAL_CANVAS_HEIGHT,
  });
  const [stagePos, setStagePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [gridConfig, setGridConfig] = useState<GridConfig>({
    size: GRID_SIZE,
    snapToGrid: true,
    visible: true,
  });
  const [history, setHistory] = useState<Shape[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Zoom control handlers
  const handleZoomIn = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const newZoom = Math.min(zoom * 1.1, 10);
    setZoom(newZoom);
    stage.scale({ x: newZoom, y: newZoom });
    stage.batchDraw();
  };

  const handleZoomOut = () => {
    const stage = stageRef.current;
    if (!stage) return;
    // Minimum zoom so canvas always fits in view
    const minZoom = Math.max(
      window.innerWidth / canvasSize.width,
      window.innerHeight / canvasSize.height,
      0.1
    );
    const newZoom = Math.max(zoom / 1.1, minZoom);
    setZoom(newZoom);
    stage.scale({ x: newZoom, y: newZoom });
    stage.batchDraw();
  };

  // Initialize shapes and zoom from initialData
  useEffect(() => {
    if (initialData?.shapes) {
      // Validate and fix shapes with negative dimensions
      const validatedShapes = initialData.shapes.map((shape) => {
        if (shape.type === "rectangle") {
          return {
            ...shape,
            width: Math.abs(shape.width || 0),
            height: Math.abs(shape.height || 0),
          };
        }
        return shape;
      });
      setShapes(validatedShapes);
    }
    if (initialData?.zoom) {
      setZoom(initialData.zoom);
    }
  }, [initialData]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;

      switch (e.key) {
        case "1":
          setTool("rectangle");
          break;
        case "2":
          setTool("arrow");
          break;
        case "3":
          setTool("pan");
          break;
        case "Escape":
          setSelectedId(null);
          break;
      }

      // Undo/Redo
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            // Redo
            if (historyIndex < history.length - 1) {
              const newIndex = historyIndex + 1;
              setHistoryIndex(newIndex);
              setShapes(history[newIndex]);
            }
          } else {
            // Undo
            if (historyIndex > 0) {
              const newIndex = historyIndex - 1;
              setHistoryIndex(newIndex);
              setShapes(history[newIndex]);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () =>
      window.removeEventListener("keydown", handleKeyPress);
  }, [history, historyIndex]);

  // Update history when shapes change
  useEffect(() => {
    if (shapes !== history[historyIndex]) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(shapes);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [shapes, history, historyIndex]);

  // Handle zoom with mouse wheel (limit zoom out to fit canvas)
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      const scaleBy = 1.1;
      // Minimum zoom so canvas always fits in view
      const minZoom = Math.max(
        window.innerWidth / canvasSize.width,
        window.innerHeight / canvasSize.height,
        0.1
      );
      let newScale =
        e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      newScale = Math.max(minZoom, Math.min(10, newScale));
      setZoom(newScale);

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      setStagePos(newPos);
      stage.scale({ x: newScale, y: newScale });
      stage.position(newPos);
      stage.batchDraw();
    },
    [canvasSize]
  );

  const snapToGrid = (value: number): number => {
    if (!gridConfig.snapToGrid) return value;
    return Math.round(value / gridConfig.size) * gridConfig.size;
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    // If in pan mode, enable dragging
    if (tool === "pan") {
      stage.draggable(true);
      return;
    }

    // If clicking on a shape, select it
    if (e.target !== stage) {
      setSelectedId(e.target.id());
      return;
    }

    setIsDrawing(true);
    // Use transformed pointer position for infinite canvas
    const pointer = stage.getPointerPosition();
    const scale = stage.scaleX();
    const pos = stage.position();
    if (!pointer) return;
    const local = {
      x: (pointer.x - pos.x) / scale,
      y: (pointer.y - pos.y) / scale,
    };
    const snappedX = snapToGrid(local.x);
    const snappedY = snapToGrid(local.y);

    if (tool === "rectangle") {
      setCurrentShape({
        id: cuid(),
        type: "rectangle",
        x: snappedX,
        y: snappedY,
        width: 0,
        height: 0,
        text: "",
        fill: "#ffffff",
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      });
    } else if (tool === "arrow") {
      setCurrentShape({
        id: cuid(),
        type: "arrow",
        points: [snappedX, snappedY, snappedX, snappedY],
        stroke: "#000000",
        isSnapped: false,
      });
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !currentShape) return;
    const stage = stageRef.current;
    if (!stage) return;

    // Use transformed pointer position for infinite canvas
    const pointer = stage.getPointerPosition();
    const scale = stage.scaleX();
    const pos = stage.position();
    if (!pointer) return;
    const local = {
      x: (pointer.x - pos.x) / scale,
      y: (pointer.y - pos.y) / scale,
    };
    const snappedX = snapToGrid(local.x);
    const snappedY = snapToGrid(local.y);

    if (tool === "rectangle") {
      setCurrentShape({
        ...currentShape,
        width: snappedX - (currentShape as Rectangle).x,
        height: snappedY - (currentShape as Rectangle).y,
      });
    } else if (tool === "arrow") {
      const points = (currentShape as ArrowType).points;
      const startX = points[0];
      const startY = points[1];

      if (e.evt.shiftKey) {
        const dx = Math.abs(snappedX - startX);
        const dy = Math.abs(snappedY - startY);

        if (dx > dy) {
          setCurrentShape({
            ...currentShape,
            points: [startX, startY, snappedX, startY],
            isSnapped: true,
          });
        } else {
          setCurrentShape({
            ...currentShape,
            points: [startX, startY, startX, snappedY],
            isSnapped: true,
          });
        }
      } else {
        setCurrentShape({
          ...currentShape,
          points: [startX, startY, snappedX, snappedY],
          isSnapped: false,
        });
      }
    }
  };

  // Expand canvas if shape is near edge
  const maybeExpandCanvas = (shape: Partial<Shape>) => {
    if (!shape) return;
    const expand = { right: false, bottom: false };
    if (shape.type === "rectangle") {
      const rect = shape as Rectangle;
      if (
        rect.x + rect.width >
        canvasSize.width - CANVAS_EXPAND_MARGIN
      )
        expand.right = true;
      if (
        rect.y + rect.height >
        canvasSize.height - CANVAS_EXPAND_MARGIN
      )
        expand.bottom = true;
    } else if (shape.type === "arrow") {
      const points = (shape as ArrowType).points;
      if (points[2] > canvasSize.width - CANVAS_EXPAND_MARGIN)
        expand.right = true;
      if (points[3] > canvasSize.height - CANVAS_EXPAND_MARGIN)
        expand.bottom = true;
    }
    if (expand.right || expand.bottom) {
      setCanvasSize((prev) => ({
        width: expand.right
          ? prev.width + CANVAS_EXPAND_AMOUNT
          : prev.width,
        height: expand.bottom
          ? prev.height + CANVAS_EXPAND_AMOUNT
          : prev.height,
      }));
    }
  };

  const handleMouseUp = () => {
    const stage = stageRef.current;
    if (stage) {
      stage.draggable(false);
    }

    if (currentShape) {
      maybeExpandCanvas(currentShape);
      setShapes([...shapes, currentShape as Shape]);
    }
    setIsDrawing(false);
    setCurrentShape(null);
  };

  const handleTextChange = (id: string, newText: string) => {
    setShapes(
      shapes.map((shape) =>
        shape.id === id && shape.type === "rectangle"
          ? { ...shape, text: newText }
          : shape
      )
    );
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const id = e.target.id();
    const pos = e.target.position();

    setShapes(
      shapes.map((shape) =>
        shape.id === id
          ? { ...shape, x: snapToGrid(pos.x), y: snapToGrid(pos.y) }
          : shape
      )
    );
  };

  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target;
    const id = node.id();

    setShapes(
      shapes.map((shape) =>
        shape.id === id && shape.type === "rectangle"
          ? {
              ...shape,
              x: snapToGrid(node.x()),
              y: snapToGrid(node.y()),
              width: snapToGrid(node.width() * node.scaleX()),
              height: snapToGrid(node.height() * node.scaleY()),
              rotation: node.rotation(),
              scaleX: 1,
              scaleY: 1,
            }
          : shape
      )
    );
  };

  const handleSave = () => {
    if (onSave) {
      onSave({ shapes, zoom });
    }
  };

  // Only render grid lines in the visible viewport for performance
  const drawGrid = () => {
    if (!gridConfig.visible) return null;
    const stage = stageRef.current;
    if (!stage) return null;
    const scale = stage.scaleX();
    const { x: stageX, y: stageY } = stage.position();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const lines = [];

    // Calculate visible area in virtual canvas coordinates
    const left = -stageX / scale;
    const top = -stageY / scale;
    const right = left + viewWidth / scale;
    const bottom = top + viewHeight / scale;

    // Clamp grid to canvas size
    const gridRight = Math.min(canvasSize.width, right);
    const gridBottom = Math.min(canvasSize.height, bottom);

    // Vertical lines
    const firstV =
      Math.floor(left / gridConfig.size) * gridConfig.size;
    const lastV =
      Math.ceil(gridRight / gridConfig.size) * gridConfig.size;
    for (let i = firstV; i <= lastV; i += gridConfig.size) {
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i, top, i, gridBottom]}
          stroke="#ddd"
          strokeWidth={1}
        />
      );
    }
    // Horizontal lines
    const firstH =
      Math.floor(top / gridConfig.size) * gridConfig.size;
    const lastH =
      Math.ceil(gridBottom / gridConfig.size) * gridConfig.size;
    for (let i = firstH; i <= lastH; i += gridConfig.size) {
      lines.push(
        <Line
          key={`h-${i}`}
          points={[left, i, gridRight, i]}
          stroke="#ddd"
          strokeWidth={1}
        />
      );
    }
    return lines;
  };

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-20 gap-1 bg-white/90 rounded-lg shadow flex items-center px-2 py-1 border border-gray-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={tool === "rectangle" ? "default" : "ghost"}
                size="icon"
                onClick={() => setTool("rectangle")}
                aria-label="Rectangle (1)"
              >
                <Square className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rectangle (1)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={tool === "arrow" ? "default" : "ghost"}
                size="icon"
                onClick={() => setTool("arrow")}
                aria-label="Arrow (2)"
              >
                <ArrowRight className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Arrow (2)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={tool === "pan" ? "default" : "ghost"}
                size="icon"
                onClick={() => setTool("pan")}
                aria-label="Pan (3)"
              >
                <Hand className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pan (3)</TooltipContent>
          </Tooltip>
          <span className="mx-2 border-l h-6 border-gray-200" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSave}
                aria-label="Save"
              >
                <Save className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={gridConfig.visible ? "default" : "ghost"}
                size="icon"
                onClick={() =>
                  setGridConfig((prev) => ({
                    ...prev,
                    visible: !prev.visible,
                  }))
                }
                aria-label="Toggle Grid"
              >
                <Grid className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Grid</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={gridConfig.snapToGrid ? "default" : "ghost"}
                size="icon"
                onClick={() =>
                  setGridConfig((prev) => ({
                    ...prev,
                    snapToGrid: !prev.snapToGrid,
                  }))
                }
                aria-label="Toggle Snap"
              >
                <Magnet className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Snap</TooltipContent>
          </Tooltip>
          <span className="mx-2 border-l h-6 border-gray-200" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (historyIndex > 0) {
                    const newIndex = historyIndex - 1;
                    setHistoryIndex(newIndex);
                    setShapes(history[newIndex]);
                  }
                }}
                aria-label="Undo (⌘Z)"
                disabled={historyIndex === 0}
              >
                <Undo2 className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (⌘Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (historyIndex < history.length - 1) {
                    const newIndex = historyIndex + 1;
                    setHistoryIndex(newIndex);
                    setShapes(history[newIndex]);
                  }
                }}
                aria-label="Redo (⌘⇧Z)"
                disabled={historyIndex === history.length - 1}
              >
                <Redo2 className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        x={stagePos.x}
        y={stagePos.y}
        draggable={tool === "pan"}
        dragBoundFunc={(pos) => {
          // Prevent panning outside the canvas
          const minX = -(canvasSize.width * zoom - window.innerWidth);
          const minY = -(
            canvasSize.height * zoom -
            window.innerHeight
          );
          return {
            x: Math.max(Math.min(pos.x, 0), minX),
            y: Math.max(Math.min(pos.y, 0), minY),
          };
        }}
        onDragMove={(e) => {
          setStagePos(e.target.position());
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        scale={{ x: zoom, y: zoom }}
        className="konva-stage"
      >
        <Layer>
          {drawGrid()}
          {/* Only render shapes in visible area for performance if needed (optional) */}
          {shapes.map((shape) => {
            if (shape.type === "rectangle") {
              return (
                <React.Fragment key={shape.id}>
                  <Rect
                    id={shape.id}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.fill}
                    stroke="#000000"
                    rotation={shape.rotation}
                    scaleX={shape.scaleX}
                    scaleY={shape.scaleY}
                    draggable={tool !== "pan"}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedId(shape.id)}
                    onTap={() => setSelectedId(shape.id)}
                  />
                  <Text
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    text={shape.text}
                    align="center"
                    verticalAlign="middle"
                    fontSize={16}
                    onClick={() => setSelectedId(shape.id)}
                    onTap={() => setSelectedId(shape.id)}
                  />
                  {selectedId === shape.id && (
                    <Transformer
                      boundBoxFunc={(oldBox, newBox) => {
                        const minSize = 20;
                        if (
                          newBox.width < minSize ||
                          newBox.height < minSize
                        ) {
                          return oldBox;
                        }
                        return newBox;
                      }}
                      onTransformEnd={handleTransformEnd}
                    />
                  )}
                </React.Fragment>
              );
            } else if (shape.type === "arrow") {
              return (
                <Arrow
                  key={shape.id}
                  id={shape.id}
                  points={shape.points}
                  stroke={shape.stroke}
                  fill={shape.stroke}
                  pointerLength={10}
                  pointerWidth={10}
                  onClick={() => setSelectedId(shape.id)}
                  onTap={() => setSelectedId(shape.id)}
                />
              );
            }
            return null;
          })}
          {currentShape && (
            <>
              {currentShape.type === "rectangle" && (
                <Rect
                  x={(currentShape as Rectangle).x}
                  y={(currentShape as Rectangle).y}
                  width={(currentShape as Rectangle).width}
                  height={(currentShape as Rectangle).height}
                  fill={(currentShape as Rectangle).fill}
                  stroke="#000000"
                />
              )}
              {currentShape.type === "arrow" && (
                <Arrow
                  points={(currentShape as ArrowType).points}
                  stroke={(currentShape as ArrowType).stroke}
                  fill={(currentShape as ArrowType).stroke}
                  pointerLength={10}
                  pointerWidth={10}
                />
              )}
            </>
          )}
        </Layer>
      </Stage>
      {selectedId &&
        shapes.find((s) => s.id === selectedId)?.type ===
          "rectangle" && (
          <div className="absolute top-20 left-4 z-10 bg-white p-2 rounded shadow">
            <input
              type="text"
              value={
                (shapes.find((s) => s.id === selectedId) as Rectangle)
                  ?.text || ""
              }
              autoFocus
              onChange={(e) =>
                handleTextChange(selectedId, e.target.value)
              }
              className="border p-2 rounded"
              placeholder="Enter text..."
            />
          </div>
        )}

      {/* Zoom control at lower left */}
      <div className="fixed bottom-6 left-6 z-30">
        <div className="flex items-center bg-gray-100/80 rounded-xl px-6 py-2 shadow text-lg font-medium select-none border border-gray-200">
          <button
            onClick={handleZoomOut}
            className="px-2 text-xl text-gray-600 hover:text-gray-900 transition-colors duration-200 focus:outline-none"
            aria-label="Zoom out"
          >
            –
          </button>
          <span className="mx-3 w-12 text-center tabular-nums text-base font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-2 text-xl text-gray-600 hover:text-gray-900 transition-colors duration-200 focus:outline-none"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrawingCanvas;
