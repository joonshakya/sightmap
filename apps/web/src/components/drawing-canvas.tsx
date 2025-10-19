import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect, Line, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { RouterInputs, RouterOutputs } from "@/utils/trpc";

type Room = RouterOutputs["floor"]["getFloorData"]["rooms"][number];

export default function DrawingCanvas({
  rooms,
  onRoomUpdate,
  onRoomCreate,
  onRoomDelete,
  gridSize = 20,
  canvasWidth = 800,
  canvasHeight = 600,
}: {
  rooms: Room[];
  onRoomUpdate: (
    input: RouterInputs["floor"]["updateRoomCoordinates"]
  ) => void;
  onRoomCreate?: (
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  onRoomDelete?: (roomId: string) => void;
  gridSize?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    null
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const stageRef = useRef<any>(null);

  // Keyboard event handling for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedRoomId &&
        onRoomDelete
      ) {
        onRoomDelete(selectedRoomId);
        setSelectedRoomId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRoomId, onRoomDelete]);

  // Generate grid lines
  const generateGrid = () => {
    const lines = [];
    const stageWidth = window.innerWidth - 48;
    const stageHeight = window.innerHeight - 200;

    // Vertical lines
    for (let x = 0; x <= stageWidth; x += gridSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, stageHeight]}
          stroke="#e0e0e0"
          strokeWidth={1}
        />
      );
    }
    // Horizontal lines
    for (let y = 0; y <= stageHeight; y += gridSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, stageWidth, y]}
          stroke="#e0e0e0"
          strokeWidth={1}
        />
      );
    }
    return lines;
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Check if clicking on existing room
    const clickedRoom = rooms.find(
      (room) =>
        pos.x >= room.x &&
        pos.x <= room.x + room.width &&
        pos.y >= room.y &&
        pos.y <= room.y + room.height
    );

    if (clickedRoom) {
      setSelectedRoomId(clickedRoom.id);
    } else {
      // Start drawing new room
      setIsDrawing(true);
      setStartPos(pos);
      setCurrentPos(pos);
      setSelectedRoomId(null);
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    setCurrentPos(pos);
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const width = Math.abs(pos.x - startPos.x);
    const height = Math.abs(pos.y - startPos.y);
    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);

    if (width > gridSize && height > gridSize && onRoomCreate) {
      // Snap to grid
      const snappedX = Math.round(x / gridSize) * gridSize;
      const snappedY = Math.round(y / gridSize) * gridSize;
      const snappedWidth = Math.round(width / gridSize) * gridSize;
      const snappedHeight = Math.round(height / gridSize) * gridSize;

      onRoomCreate(snappedX, snappedY, snappedWidth, snappedHeight);
    }

    setIsDrawing(false);
  };

  const handleDragEnd = (
    e: KonvaEventObject<DragEvent>,
    room: Room
  ) => {
    const newX = Math.round(e.target.x() / gridSize) * gridSize;
    const newY = Math.round(e.target.y() / gridSize) * gridSize;

    onRoomUpdate({
      roomId: room.id,
      x: newX,
      y: newY,
      width: room.width,
      height: room.height,
    });
    setSelectedRoomId(null);
  };

  return (
    <div className="w-full h-full border border-gray-300">
      <Stage
        ref={stageRef}
        width={window.innerWidth - 48} // Account for padding (px-6 = 24px on each side)
        height={window.innerHeight - 200} // Account for header, title, and padding
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          {/* Grid */}
          {generateGrid()}

          {/* Rooms */}
          {rooms.map((room) => (
            <Group
              key={room.id}
              x={room.x}
              y={room.y}
              draggable
              onDragEnd={(e) => handleDragEnd(e, room)}
              onClick={() => setSelectedRoomId(room.id)}
            >
              {/* Wall border (outer rectangle) */}
              <Rect
                x={-gridSize}
                y={-gridSize}
                width={room.width + 2 * gridSize}
                height={room.height + 2 * gridSize}
                fill="#8B4513" // Brown color for walls
                stroke="#654321"
                strokeWidth={1}
              />
              {/* Room interior */}
              <Rect
                x={0}
                y={0}
                width={room.width}
                height={room.height}
                fill="#F5F5DC" // Beige color for room interior
                stroke={
                  selectedRoomId === room.id ? "#007bff" : "#D2B48C"
                }
                strokeWidth={2}
              />
            </Group>
          ))}

          {/* Drawing preview - only show when actually dragging */}
          {isDrawing &&
            (currentPos.x !== startPos.x ||
              currentPos.y !== startPos.y) && (
              <Group>
                {/* Wall border preview */}
                <Rect
                  x={Math.min(startPos.x, currentPos.x) - gridSize}
                  y={Math.min(startPos.y, currentPos.y) - gridSize}
                  width={
                    Math.abs(currentPos.x - startPos.x) + 2 * gridSize
                  }
                  height={
                    Math.abs(currentPos.y - startPos.y) + 2 * gridSize
                  }
                  fill="rgba(139, 69, 19, 0.3)" // Brown color for walls with transparency
                  stroke="#654321"
                  strokeWidth={1}
                />
                {/* Room interior preview */}
                <Rect
                  x={Math.min(startPos.x, currentPos.x)}
                  y={Math.min(startPos.y, currentPos.y)}
                  width={Math.abs(currentPos.x - startPos.x)}
                  height={Math.abs(currentPos.y - startPos.y)}
                  fill="rgba(245, 245, 220, 0.5)" // Beige color for room interior with transparency
                  stroke="rgba(210, 180, 140, 0.7)"
                  strokeWidth={2}
                />
              </Group>
            )}
        </Layer>
      </Stage>
    </div>
  );
}
