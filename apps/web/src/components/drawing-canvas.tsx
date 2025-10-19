import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect, Line, Group } from "react-konva";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { RouterInputs, RouterOutputs } from "@/utils/trpc";

type Room = RouterOutputs["floor"]["getFloorData"]["rooms"][number];

type PendingRoom = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorX?: number;
  doorY?: number;
};

// Helper function to check if door is at a corner position
const isCornerDoor = (
  doorX: number,
  doorY: number,
  roomWidth: number,
  roomHeight: number,
  gridSize: number
): boolean => {
  const isTopLeft = doorX === 0 && doorY === 0;
  const isTopRight = doorX === roomWidth - gridSize && doorY === 0;
  const isBottomLeft = doorX === 0 && doorY === roomHeight - gridSize;
  const isBottomRight =
    doorX === roomWidth - gridSize && doorY === roomHeight - gridSize;

  return isTopLeft || isTopRight || isBottomLeft || isBottomRight;
};

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
    height: number,
    doorX?: number,
    doorY?: number
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
  const [pendingRooms, setPendingRooms] = useState<PendingRoom[]>([]);
  const stageRef = useRef<any>(null);

  // Keyboard event handling for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedRoomId
      ) {
        // Check if it's a saved room
        const savedRoom = rooms.find(
          (room) => room.id === selectedRoomId
        );
        if (savedRoom && onRoomDelete) {
          onRoomDelete(selectedRoomId);
        } else {
          // It's a pending room, remove from pending rooms
          setPendingRooms((prev) =>
            prev.filter((room) => room.id !== selectedRoomId)
          );
        }
        setSelectedRoomId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRoomId, onRoomDelete, rooms]);

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

    // Check if clicking on existing room's wall border
    const clickedRoom = rooms.find(
      (room) =>
        pos.x >= room.x - gridSize &&
        pos.x <= room.x + room.width + gridSize &&
        pos.y >= room.y - gridSize &&
        pos.y <= room.y + room.height + gridSize &&
        !(
          pos.x >= room.x &&
          pos.x <= room.x + room.width &&
          pos.y >= room.y &&
          pos.y <= room.y + room.height
        )
    );

    // Check if clicking on pending room's wall border
    const clickedPendingRoom = pendingRooms.find(
      (room) =>
        pos.x >= room.x - gridSize &&
        pos.x <= room.x + room.width + gridSize &&
        pos.y >= room.y - gridSize &&
        pos.y <= room.y + room.height + gridSize &&
        !(
          pos.x >= room.x &&
          pos.x <= room.x + room.width &&
          pos.y >= room.y &&
          pos.y <= room.y + room.height
        )
    );

    if (clickedRoom) {
      // Clicked on wall border - set door position
      const doorX =
        Math.floor((pos.x - clickedRoom.x) / gridSize) * gridSize;
      const doorY =
        Math.floor((pos.y - clickedRoom.y) / gridSize) * gridSize;

      // Update room with door coordinates
      onRoomUpdate({
        roomId: clickedRoom.id,
        x: clickedRoom.x,
        y: clickedRoom.y,
        width: clickedRoom.width,
        height: clickedRoom.height,
        doorX,
        doorY,
      });
      setSelectedRoomId(clickedRoom.id);
    } else if (clickedPendingRoom) {
      // Clicked on pending room wall border - set door position
      const doorX =
        Math.floor((pos.x - clickedPendingRoom.x) / gridSize) *
        gridSize;
      const doorY =
        Math.floor((pos.y - clickedPendingRoom.y) / gridSize) *
        gridSize;

      // Update pending room with door coordinates
      setPendingRooms((prev) =>
        prev.map((r) =>
          r.id === clickedPendingRoom.id ? { ...r, doorX, doorY } : r
        )
      );
      setSelectedRoomId(clickedPendingRoom.id);
    } else {
      // Check if clicking on existing room interior
      const clickedRoomInterior = rooms.find(
        (room) =>
          pos.x >= room.x &&
          pos.x <= room.x + room.width &&
          pos.y >= room.y &&
          pos.y <= room.y + room.height
      );

      // Check if clicking on pending room interior
      const clickedPendingRoomInterior = pendingRooms.find(
        (room) =>
          pos.x >= room.x &&
          pos.x <= room.x + room.width &&
          pos.y >= room.y &&
          pos.y <= room.y + room.height
      );

      if (clickedRoomInterior) {
        setSelectedRoomId(clickedRoomInterior.id);
      } else if (clickedPendingRoomInterior) {
        setSelectedRoomId(clickedPendingRoomInterior.id);
      } else {
        // Start drawing new room
        setIsDrawing(true);
        setStartPos(pos);
        setCurrentPos(pos);
        setSelectedRoomId(null);
      }
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

    if (width > gridSize && height > gridSize) {
      // Snap to grid
      const snappedX = Math.floor(x / gridSize) * gridSize;
      const snappedY = Math.floor(y / gridSize) * gridSize;
      const snappedWidth = Math.floor(width / gridSize) * gridSize;
      const snappedHeight = Math.floor(height / gridSize) * gridSize;

      // Add to pending rooms instead of creating immediately
      const newPendingRoom: PendingRoom = {
        id: `pending-${Date.now()}-${Math.random()}`,
        x: snappedX,
        y: snappedY,
        width: snappedWidth,
        height: snappedHeight,
      };

      setPendingRooms((prev) => [...prev, newPendingRoom]);
    }

    setIsDrawing(false);
  };

  const handleDragEnd = (
    e: KonvaEventObject<DragEvent>,
    room: Room
  ) => {
    const newX = Math.floor(e.target.x() / gridSize) * gridSize;
    const newY = Math.floor(e.target.y() / gridSize) * gridSize;

    onRoomUpdate({
      roomId: room.id,
      x: newX,
      y: newY,
      width: room.width,
      height: room.height,
    });
    setSelectedRoomId(null);
  };

  const handlePendingDragEnd = (
    e: KonvaEventObject<DragEvent>,
    room: PendingRoom
  ) => {
    const newX = Math.floor(e.target.x() / gridSize) * gridSize;
    const newY = Math.floor(e.target.y() / gridSize) * gridSize;

    // Update pending room position
    setPendingRooms((prev) =>
      prev.map((r) =>
        r.id === room.id ? { ...r, x: newX, y: newY } : r
      )
    );
    setSelectedRoomId(null);
  };

  const handleSave = () => {
    if (!onRoomCreate) return;

    // Create all pending rooms
    pendingRooms.forEach((room) => {
      onRoomCreate(
        room.x,
        room.y,
        room.width,
        room.height,
        room.doorX,
        room.doorY
      );
    });

    // Clear pending rooms
    setPendingRooms([]);
  };

  return (
    <div className="w-full h-full relative">
      {/* Save Button */}
      {pendingRooms.length > 0 && (
        <div className="absolute top-4 right-4 z-10">
          <Button
            onClick={handleSave}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            Save Map ({pendingRooms.length} rooms)
          </Button>
        </div>
      )}

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
                {/* Door */}
                {room.doorX !== null &&
                  room.doorY !== null &&
                  !isCornerDoor(
                    room.doorX,
                    room.doorY,
                    room.width,
                    room.height,
                    gridSize
                  ) && (
                    <Rect
                      x={room.doorX}
                      y={room.doorY}
                      width={gridSize}
                      height={gridSize}
                      fill="#F5F5DC" // Same color as room interior
                      stroke="#D2B48C"
                      strokeWidth={1}
                    />
                  )}
              </Group>
            ))}

            {/* Pending Rooms */}
            {pendingRooms.map((room) => (
              <Group
                key={room.id}
                x={room.x}
                y={room.y}
                draggable
                onDragEnd={(e) => handlePendingDragEnd(e, room)}
                onClick={() => setSelectedRoomId(room.id)}
              >
                {/* Wall border (outer rectangle) */}
                <Rect
                  x={-gridSize}
                  y={-gridSize}
                  width={room.width + 2 * gridSize}
                  height={room.height + 2 * gridSize}
                  fill="rgba(139, 69, 19, 0.5)" // Brown color for walls with transparency
                  stroke="#654321"
                  strokeWidth={1}
                />
                {/* Room interior */}
                <Rect
                  x={0}
                  y={0}
                  width={room.width}
                  height={room.height}
                  fill="rgba(245, 245, 220, 0.7)" // Beige color for room interior with transparency
                  stroke={
                    selectedRoomId === room.id
                      ? "#007bff"
                      : "rgba(210, 180, 140, 0.7)"
                  }
                  strokeWidth={2}
                />
                {/* Door */}
                {room.doorX !== undefined &&
                  room.doorY !== undefined &&
                  !isCornerDoor(
                    room.doorX,
                    room.doorY,
                    room.width,
                    room.height,
                    gridSize
                  ) && (
                    <Rect
                      x={room.doorX}
                      y={room.doorY}
                      width={gridSize}
                      height={gridSize}
                      fill="rgba(245, 245, 220, 0.7)" // Same color as room interior with transparency
                      stroke="rgba(210, 180, 140, 0.7)"
                      strokeWidth={1}
                    />
                  )}
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
                      Math.abs(currentPos.x - startPos.x) +
                      2 * gridSize
                    }
                    height={
                      Math.abs(currentPos.y - startPos.y) +
                      2 * gridSize
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
    </div>
  );
}
