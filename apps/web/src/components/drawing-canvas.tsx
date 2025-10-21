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

type RenderableRoom = Room | PendingRoom;

// Color constants
const COLORS = {
  grid: "#e0e0e0",
  wall: {
    solid: "#D0D0D0",
    selected: "#B0B0B0",
    stroke: "#654321",
    pending: "rgba(208, 208, 208, 0.5)",
  },
  room: {
    interior: "#FEFEFE",
    pending: "rgba(254, 254, 254, 0.7)",
    stroke: "#D2B48C",
    pendingStroke: "rgba(210, 180, 140, 0.7)",
  },
  selection: "#007bff",
  preview: {
    wall: "rgba(208, 208, 208, 0.3)",
    interior: "rgba(254, 254, 254, 0.5)",
    stroke: "rgba(210, 180, 140, 0.7)",
  },
} as const;

// Helper function to check if door is at a corner position
const isCornerDoor = (
  doorX: number,
  doorY: number,
  roomWidth: number,
  roomHeight: number,
  gridSize: number
): boolean => {
  const corners = [
    [0, 0],
    [roomWidth - gridSize, 0],
    [0, roomHeight - gridSize],
    [roomWidth - gridSize, roomHeight - gridSize],
  ];
  return corners.some(([x, y]) => doorX === x && doorY === y);
};

// Helper to check if point is on room border
const isOnRoomBorder = (
  pos: { x: number; y: number },
  room: RenderableRoom,
  gridSize: number
) => {
  const { x, y, width, height } = room;
  const inBorderArea =
    pos.x >= x - gridSize &&
    pos.x <= x + width + gridSize &&
    pos.y >= y - gridSize &&
    pos.y <= y + height + gridSize;
  const inInterior =
    pos.x >= x &&
    pos.x <= x + width &&
    pos.y >= y &&
    pos.y <= y + height;
  return inBorderArea && !inInterior;
};

// Helper to check if point is in room interior
const isInRoomInterior = (
  pos: { x: number; y: number },
  room: RenderableRoom
) => {
  const { x, y, width, height } = room;
  return (
    pos.x >= x &&
    pos.x <= x + width &&
    pos.y >= y &&
    pos.y <= y + height
  );
};

// Helper to calculate snapped door position
const calculateDoorPosition = (
  pos: { x: number; y: number },
  room: RenderableRoom,
  gridSize: number
) => ({
  doorX: Math.floor((pos.x - room.x) / gridSize) * gridSize,
  doorY: Math.floor((pos.y - room.y) / gridSize) * gridSize,
});

// Reusable room component
const RoomComponent = ({
  room,
  isPending = false,
  selectedRoomId,
  gridSize,
  onDragEnd,
  onClick,
}: {
  room: RenderableRoom;
  isPending?: boolean;
  selectedRoomId: string | null;
  gridSize: number;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onClick: () => void;
}) => {
  const isSelected = selectedRoomId === room.id;
  const wallFill = isPending
    ? COLORS.wall.pending
    : isSelected
    ? COLORS.wall.selected
    : COLORS.wall.solid;
  const interiorFill = isPending
    ? COLORS.room.pending
    : COLORS.room.interior;
  const strokeColor = isSelected
    ? COLORS.selection
    : isPending
    ? COLORS.room.pendingStroke
    : COLORS.room.stroke;

  const hasDoor =
    "doorX" in room
      ? room.doorX !== null && room.doorY !== null
      : room.doorX !== undefined && room.doorY !== undefined;

  // Constrain drag to grid positions
  const dragBoundFunc = (pos: { x: number; y: number }) => ({
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize,
  });

  return (
    <Group
      x={room.x}
      y={room.y}
      draggable
      dragBoundFunc={dragBoundFunc}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      {/* Wall border */}
      <Rect
        x={-gridSize}
        y={-gridSize}
        width={room.width + 2 * gridSize}
        height={room.height + 2 * gridSize}
        fill={wallFill}
      />
      {/* Room interior */}
      <Rect
        x={0}
        y={0}
        width={room.width}
        height={room.height}
        fill={interiorFill}
      />
      {/* Door */}
      {hasDoor &&
        !isCornerDoor(
          room.doorX!,
          room.doorY!,
          room.width,
          room.height,
          gridSize
        ) && (
          <Rect
            x={room.doorX!}
            y={room.doorY!}
            width={gridSize}
            height={gridSize}
            fill={interiorFill}
          />
        )}
    </Group>
  );
};

// Drawing preview component
const DrawingPreview = ({
  startPos,
  currentPos,
  gridSize,
}: {
  startPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  gridSize: number;
}) => {
  const x = Math.min(startPos.x, currentPos.x);
  const y = Math.min(startPos.y, currentPos.y);
  const width = Math.abs(currentPos.x - startPos.x);
  const height = Math.abs(currentPos.y - startPos.y);

  return (
    <Group>
      {/* Wall border preview */}
      <Rect
        x={x - gridSize}
        y={y - gridSize}
        width={width + 2 * gridSize}
        height={height + 2 * gridSize}
        fill={COLORS.preview.wall}
      />
      {/* Room interior preview */}
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={COLORS.preview.interior}
      />
    </Group>
  );
};

export default function DrawingCanvas({
  stageDimensions,
  rooms,
  onRoomUpdate,
  onRoomCreate,
  onRoomDelete,
  gridSize = 20,
}: {
  stageDimensions: { width: number; height: number };
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
}) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    null
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [pendingRooms, setPendingRooms] = useState<PendingRoom[]>([]);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [accumulatedDeltaX, setAccumulatedDeltaX] = useState(0);
  const [accumulatedDeltaY, setAccumulatedDeltaY] = useState(0);
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
    const { width: stageWidth, height: stageHeight } =
      stageDimensions;

    // Calculate visible area bounds considering pan offset
    const startX = Math.floor(-panX / gridSize) * gridSize;
    const endX =
      Math.ceil((-panX + stageWidth) / gridSize) * gridSize;
    const startY = Math.floor(-panY / gridSize) * gridSize;
    const endY =
      Math.ceil((-panY + stageHeight) / gridSize) * gridSize;

    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, startY, x, endY]}
          stroke={COLORS.grid}
          strokeWidth={1}
        />
      );
    }
    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[startX, y, endX, y]}
          stroke={COLORS.grid}
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

    // Find clicked room (saved or pending) on border
    const clickedRoom = [...rooms, ...pendingRooms].find((room) =>
      isOnRoomBorder(pos, room, gridSize)
    );

    if (clickedRoom) {
      // Clicked on wall border - set door position
      const { doorX, doorY } = calculateDoorPosition(
        pos,
        clickedRoom,
        gridSize
      );

      if ("doorX" in clickedRoom) {
        // It's a saved room
        onRoomUpdate({
          roomId: clickedRoom.id,
          x: clickedRoom.x,
          y: clickedRoom.y,
          width: clickedRoom.width,
          height: clickedRoom.height,
          doorX,
          doorY,
        });
      } else {
        // It's a pending room
        setPendingRooms((prev) =>
          prev.map((r) =>
            r.id === clickedRoom.id ? { ...r, doorX, doorY } : r
          )
        );
      }
      setSelectedRoomId(clickedRoom.id);
      return;
    }

    // Find clicked room interior
    const clickedRoomInterior = [...rooms, ...pendingRooms].find(
      (room) => isInRoomInterior(pos, room)
    );

    if (clickedRoomInterior) {
      setSelectedRoomId(clickedRoomInterior.id);
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

    if (width > gridSize && height > gridSize) {
      // Snap to grid
      const snappedX = Math.round(x / gridSize) * gridSize;
      const snappedY = Math.round(y / gridSize) * gridSize;
      const snappedWidth = Math.round(width / gridSize) * gridSize;
      const snappedHeight = Math.round(height / gridSize) * gridSize;

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

  const handlePendingDragEnd = (
    e: KonvaEventObject<DragEvent>,
    room: PendingRoom
  ) => {
    const newX = Math.round(e.target.x() / gridSize) * gridSize;
    const newY = Math.round(e.target.y() / gridSize) * gridSize;

    // Update pending room position
    setPendingRooms((prev) =>
      prev.map((r) =>
        r.id === room.id ? { ...r, x: newX, y: newY } : r
      )
    );
    setSelectedRoomId(null);
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const deltaX = e.evt.deltaX;
    const deltaY = e.evt.deltaY;

    // Accumulate deltas
    setAccumulatedDeltaX((prev) => {
      const newAccumulated = prev + deltaX;
      const panSteps = Math.floor(
        Math.abs(newAccumulated) / gridSize
      );

      if (panSteps > 0) {
        const panAmount =
          Math.sign(newAccumulated) * panSteps * gridSize;
        setPanX((panX) => panX - panAmount);
        return newAccumulated - panAmount;
      }
      return newAccumulated;
    });

    setAccumulatedDeltaY((prev) => {
      const newAccumulated = prev + deltaY;
      const panSteps = Math.floor(
        Math.abs(newAccumulated) / gridSize
      );

      if (panSteps > 0) {
        const panAmount =
          Math.sign(newAccumulated) * panSteps * gridSize;
        setPanY((panY) => panY - panAmount);
        return newAccumulated - panAmount;
      }
      return newAccumulated;
    });
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

      <div className="w-full h-full">
        <Stage
          ref={stageRef}
          width={stageDimensions.width}
          height={stageDimensions.height}
          x={panX}
          y={panY}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          <Layer>
            {/* Grid */}
            {generateGrid()}

            {/* Rooms */}
            {rooms.map((room) => (
              <RoomComponent
                key={room.id}
                room={room}
                selectedRoomId={selectedRoomId}
                gridSize={gridSize}
                onDragEnd={(e) => handleDragEnd(e, room)}
                onClick={() => setSelectedRoomId(room.id)}
              />
            ))}

            {/* Pending Rooms */}
            {pendingRooms.map((room) => (
              <RoomComponent
                key={room.id}
                room={room}
                isPending
                selectedRoomId={selectedRoomId}
                gridSize={gridSize}
                onDragEnd={(e) => handlePendingDragEnd(e, room)}
                onClick={() => setSelectedRoomId(room.id)}
              />
            ))}

            {/* Drawing preview */}
            {isDrawing &&
              (currentPos.x !== startPos.x ||
                currentPos.y !== startPos.y) && (
                <DrawingPreview
                  startPos={startPos}
                  currentPos={currentPos}
                  gridSize={gridSize}
                />
              )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
