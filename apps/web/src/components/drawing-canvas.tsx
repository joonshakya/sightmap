import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Stage, Layer, Rect, Line, Group, Text } from "react-konva";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { RouterInputs, RouterOutputs } from "@/utils/trpc";

// Types
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

type Position = { x: number; y: number };

type PathCreationState = {
  stage: "idle" | "selecting_destination" | "drawing_path";
  sourceRoomId: string | null;
  destinationRoomId: string | null;
  currentPoints: Position[];
};

type DrawingCanvasConfig = {
  gridSize: number;
  zoomLimits: { min: number; max: number };
  panStepSize: number;
  zoomStepSize: number;
  touchpadPinchThreshold: number;
};

// Constants
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

const DEFAULT_CONFIG: DrawingCanvasConfig = {
  gridSize: 20,
  zoomLimits: { min: 0.1, max: 5 },
  panStepSize: 20,
  zoomStepSize: 0.1,
  touchpadPinchThreshold: 100,
};

// Utility functions
const screenToWorld = (
  screenPos: Position,
  panX: number,
  panY: number,
  zoom: number
): Position => ({
  x: (screenPos.x - panX) / zoom,
  y: (screenPos.y - panY) / zoom,
});

const worldToScreen = (
  worldPos: Position,
  panX: number,
  panY: number,
  zoom: number
): Position => ({
  x: worldPos.x * zoom + panX,
  y: worldPos.y * zoom + panY,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const getDistance = (p1: Position, p2: Position): number =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

const getCenter = (p1: Position, p2: Position): Position => ({
  x: (p1.x + p2.x) / 2,
  y: (p1.y + p2.y) / 2,
});

const snapToGrid = (pos: Position, gridSize: number): Position => ({
  x: Math.round(pos.x / gridSize) * gridSize,
  y: Math.round(pos.y / gridSize) * gridSize,
});

const snapToGridCenter = (
  pos: Position,
  gridSize: number
): Position => ({
  x: Math.floor(pos.x / gridSize) * gridSize + gridSize / 2,
  y: Math.floor(pos.y / gridSize) * gridSize + gridSize / 2,
});

const getOrthogonalPrediction = (
  fromPoint: Position,
  mousePos: Position,
  gridSize: number
): Position => {
  const dx = mousePos.x - fromPoint.x;
  const dy = mousePos.y - fromPoint.y;

  // Determine primary direction (horizontal vs vertical)
  let orthogonalPos: Position;
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal movement - snap to horizontal line
    orthogonalPos = {
      x: mousePos.x,
      y: fromPoint.y,
    };
  } else {
    // Vertical movement - snap to vertical line
    orthogonalPos = {
      x: fromPoint.x,
      y: mousePos.y,
    };
  }

  // Snap the orthogonal position to grid center
  return snapToGridCenter(orthogonalPos, gridSize);
};

// Custom hook for room management
const useRoomManagement = (
  rooms: Room[],
  onRoomUpdate: (
    input: RouterInputs["floor"]["updateRoomCoordinates"]
  ) => void,
  selectedRoomId: string | null,
  onRoomSelect: (roomId: string | null) => void,
  onRoomDelete?: (roomId: string) => void
) => {
  const [pendingRooms, setPendingRooms] = useState<PendingRoom[]>([]);

  const updateRoomDoor = useCallback(
    (room: RenderableRoom, worldPos: Position, gridSize: number) => {
      const { doorX, doorY } = calculateDoorPosition(
        worldPos,
        room,
        gridSize
      );

      if ("doorX" in room) {
        // Saved room
        onRoomUpdate({
          roomId: room.id,
          x: room.x,
          y: room.y,
          width: room.width,
          height: room.height,
          doorX,
          doorY,
        });
      } else {
        // Pending room
        setPendingRooms((prev) =>
          prev.map((r) =>
            r.id === room.id ? { ...r, doorX, doorY } : r
          )
        );
      }
    },
    [onRoomUpdate]
  );

  const snapRoomPosition = useCallback(
    (e: KonvaEventObject<DragEvent>, gridSize: number) => {
      const newX = Math.round(e.target.x() / gridSize) * gridSize;
      const newY = Math.round(e.target.y() / gridSize) * gridSize;

      // Snap visual position immediately
      e.target.x(newX);
      e.target.y(newY);

      return { newX, newY };
    },
    []
  );

  const handleRoomDragEnd = useCallback(
    (
      e: KonvaEventObject<DragEvent>,
      room: Room,
      gridSize: number
    ) => {
      const { newX, newY } = snapRoomPosition(e, gridSize);

      onRoomUpdate({
        roomId: room.id,
        x: newX,
        y: newY,
        width: room.width,
        height: room.height,
      });
    },
    [onRoomUpdate, snapRoomPosition]
  );

  const handlePendingRoomDragEnd = useCallback(
    (
      e: KonvaEventObject<DragEvent>,
      room: PendingRoom,
      gridSize: number
    ) => {
      const { newX, newY } = snapRoomPosition(e, gridSize);

      setPendingRooms((prev) =>
        prev.map((r) =>
          r.id === room.id ? { ...r, x: newX, y: newY } : r
        )
      );
    },
    [snapRoomPosition]
  );

  const deleteSelectedRoom = useCallback(() => {
    if (!selectedRoomId) return;

    const savedRoom = rooms.find(
      (room) => room.id === selectedRoomId
    );
    if (savedRoom && onRoomDelete) {
      onRoomDelete(selectedRoomId);
    } else {
      setPendingRooms((prev) =>
        prev.filter((room) => room.id !== selectedRoomId)
      );
    }
    onRoomSelect(null);
  }, [selectedRoomId, rooms, onRoomDelete, onRoomSelect]);

  const savePendingRooms = useCallback(
    (
      onRoomCreate?: (
        x: number,
        y: number,
        width: number,
        height: number,
        doorX?: number,
        doorY?: number
      ) => void
    ) => {
      if (!onRoomCreate) return;

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
      setPendingRooms([]);
    },
    [pendingRooms]
  );

  return {
    pendingRooms,
    setPendingRooms,
    updateRoomDoor,
    handleRoomDragEnd,
    handlePendingRoomDragEnd,
    deleteSelectedRoom,
    savePendingRooms,
  };
};

// Custom hook for drawing functionality
const useDrawing = (
  gridSize: number,
  onRoomCreated?: (room: PendingRoom) => void
) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<Position>({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState<Position>({
    x: 0,
    y: 0,
  });

  const startDrawing = useCallback((worldPos: Position) => {
    setIsDrawing(true);
    setStartPos(worldPos);
    setCurrentPos(worldPos);
  }, []);

  const updateDrawing = useCallback(
    (worldPos: Position) => {
      if (isDrawing) {
        setCurrentPos(worldPos);
      }
    },
    [isDrawing]
  );

  const finishDrawing = useCallback(() => {
    if (!isDrawing) return;

    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    setIsDrawing(false);

    if (width <= gridSize || height <= gridSize) return;

    // Snap to grid
    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    const snappedWidth = Math.round(width / gridSize) * gridSize;
    const snappedHeight = Math.round(height / gridSize) * gridSize;

    const newRoom: PendingRoom = {
      id: `pending-${Date.now()}-${Math.random()}`,
      x: snappedX,
      y: snappedY,
      width: snappedWidth,
      height: snappedHeight,
    };

    if (onRoomCreated) {
      onRoomCreated(newRoom);
    }
  }, [isDrawing, startPos, currentPos, gridSize, onRoomCreated]);

  return {
    isDrawing,
    startPos,
    currentPos,
    startDrawing,
    updateDrawing,
    finishDrawing,
  };
};

// Custom hook for pan/zoom functionality
const usePanZoom = (config: DrawingCanvasConfig) => {
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [lastCenter, setLastCenter] = useState<Position>({
    x: 0,
    y: 0,
  });
  const [lastDist, setLastDist] = useState(0);

  const zoomTo = useCallback(
    (newZoom: number, centerPoint?: Position) => {
      const clampedZoom = clamp(
        newZoom,
        config.zoomLimits.min,
        config.zoomLimits.max
      );

      if (centerPoint) {
        // Zoom towards a specific point
        const worldPoint = screenToWorld(
          centerPoint,
          panX,
          panY,
          zoom
        );
        const newPanX = centerPoint.x - worldPoint.x * clampedZoom;
        const newPanY = centerPoint.y - worldPoint.y * clampedZoom;

        setPanX(newPanX);
        setPanY(newPanY);
      }

      setZoom(clampedZoom);
    },
    [panX, panY, zoom, config.zoomLimits]
  );

  const panBy = useCallback((deltaX: number, deltaY: number) => {
    setPanX((prev) => prev - deltaX);
    setPanY((prev) => prev - deltaY);
  }, []);

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>, stage: any) => {
      e.evt.preventDefault();

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const deltaX = e.evt.deltaX;
      const deltaY = e.evt.deltaY;

      // Check if this is a zoom gesture
      if (
        e.evt.ctrlKey ||
        e.evt.metaKey ||
        Math.abs(deltaY) > config.touchpadPinchThreshold
      ) {
        const zoomFactor =
          deltaY > 0
            ? 1 - config.zoomStepSize
            : 1 + config.zoomStepSize;
        const newZoom = clamp(
          zoom * zoomFactor,
          config.zoomLimits.min,
          config.zoomLimits.max
        );

        // Zoom towards mouse position
        const worldPoint = screenToWorld(pointer, panX, panY, zoom);
        const newPanX = pointer.x - worldPoint.x * newZoom;
        const newPanY = pointer.y - worldPoint.y * newZoom;

        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
      } else {
        // This is a pan gesture - pan directly for smooth movement
        const panSensitivity = 1; // Adjust this value to control pan speed
        setPanX((panX) => panX - deltaX * panSensitivity);
        setPanY((panY) => panY - deltaY * panSensitivity);
      }
    },
    [panX, panY, zoom, config]
  );

  const handleTouchStart = useCallback(
    (e: KonvaEventObject<TouchEvent>) => {
      e.evt.preventDefault();

      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];

      if (touch1 && touch2) {
        const p1 = { x: touch1.clientX, y: touch1.clientY };
        const p2 = { x: touch2.clientX, y: touch2.clientY };

        const center = getCenter(p1, p2);
        const dist = getDistance(p1, p2);

        setLastCenter(center);
        setLastDist(dist);
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: KonvaEventObject<TouchEvent>) => {
      e.evt.preventDefault();

      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];

      if (touch1 && touch2 && lastDist > 0) {
        const p1 = { x: touch1.clientX, y: touch1.clientY };
        const p2 = { x: touch2.clientX, y: touch2.clientY };

        const center = getCenter(p1, p2);
        const dist = getDistance(p1, p2);

        const newZoom = clamp(
          zoom * (dist / lastDist),
          config.zoomLimits.min,
          config.zoomLimits.max
        );

        // Calculate pan adjustment to keep center point fixed
        const worldPoint = screenToWorld(center, panX, panY, zoom);
        const newPanX = center.x - worldPoint.x * newZoom;
        const newPanY = center.y - worldPoint.y * newZoom;

        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
        setLastCenter(center);
        setLastDist(dist);
      }
    },
    [lastDist, lastCenter, panX, panY, zoom, config.zoomLimits]
  );

  const handleTouchEnd = useCallback(
    (e: KonvaEventObject<TouchEvent>) => {
      e.evt.preventDefault();
      setLastDist(0);
    },
    []
  );

  return {
    panX,
    panY,
    zoom,
    zoomTo,
    panBy,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};

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
  isPathSource = false,
  isPathDestination = false,
  hasPaths = false,
}: {
  room: RenderableRoom;
  isPending?: boolean;
  selectedRoomId: string | null;
  gridSize: number;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onClick: () => void;
  isPathSource?: boolean;
  isPathDestination?: boolean;
  hasPaths?: boolean;
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

  const roomName = "name" in room ? room.name : "";

  // Highlight doors in path mode
  const doorFill =
    isPathSource || isPathDestination ? "#00ff00" : interiorFill;

  return (
    <Group
      x={room.x}
      y={room.y}
      draggable={!hasPaths} // Only draggable if room has no paths
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
            fill={doorFill}
          />
        )}
      {/* Room name */}
      {roomName && (
        <Text
          x={0}
          y={0}
          width={room.width}
          height={room.height}
          text={roomName}
          fontSize={16}
          fill="#333333"
          align="center"
          verticalAlign="middle"
          wrap="word"
          ellipsis={true}
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

// Path visualization component
const PathVisualization = ({
  paths,
  selectedRoomId,
  selectedPathId,
  gridSize,
}: {
  paths: Room["fromPaths"];
  selectedRoomId: string | null;
  selectedPathId: string | null;
  gridSize: number;
}) => {
  return (
    <Group>
      {paths.map((path) => {
        // Calculate path-specific opacity based on room/path selection
        let pathOpacity = 0.1; // Very faint by default

        if (selectedPathId === path.id) {
          pathOpacity = 1.0; // Full opacity for selected path
        } else if (selectedPathId) {
          // If a specific path is selected, keep all others faint
          pathOpacity = 0.1;
        } else if (selectedRoomId) {
          // If a room is selected, check if this path connects to it
          if (
            path.fromRoomId === selectedRoomId ||
            path.toRoomId === selectedRoomId
          ) {
            pathOpacity = 0.6; // Higher opacity for connected paths
          }
        }

        return (
          <Group key={path.id} opacity={pathOpacity}>
            {/* Draw lines between anchors */}
            {path.anchors
              .sort((a, b) => a.index - b.index)
              .reduce((lines, anchor, index, arr) => {
                if (index < arr.length - 1) {
                  const nextAnchor = arr[index + 1];
                  lines.push(
                    <Line
                      key={`${path.id}-${index}`}
                      points={[
                        anchor.xCoords,
                        anchor.yCoords,
                        nextAnchor.xCoords,
                        nextAnchor.yCoords,
                      ]}
                      stroke="#00ff00"
                      strokeWidth={gridSize}
                      opacity={0.8}
                    />
                  );
                }
                return lines;
              }, [] as React.JSX.Element[])}
            {/* Draw anchor points */}
            {path.anchors.map((anchor) => (
              <Rect
                key={`anchor-${anchor.id}`}
                x={anchor.xCoords - gridSize / 2}
                y={anchor.yCoords - gridSize / 2}
                width={gridSize}
                height={gridSize}
                fill="#00ff00"
                opacity={0.6}
              />
            ))}
          </Group>
        );
      })}
    </Group>
  );
};

// Path creation preview component
const PathCreationPreview = ({
  points,
  mousePos,
  gridSize,
}: {
  points: Position[];
  mousePos?: Position;
  gridSize: number;
}) => {
  if (points.length === 0) return null;

  const elements: React.JSX.Element[] = [];

  // Draw lines between current path points
  points.forEach((point, index) => {
    if (index < points.length - 1) {
      const nextPoint = points[index + 1];
      elements.push(
        <Line
          key={`preview-${index}`}
          points={[point.x, point.y, nextPoint.x, nextPoint.y]}
          stroke="#00ff00"
          strokeWidth={gridSize}
          opacity={1}
        />
      );
    }
  });

  // Draw predictive line from last point to mouse position (orthogonal)
  if (points.length > 0 && mousePos) {
    const lastPoint = points[points.length - 1];
    const prediction = getOrthogonalPrediction(
      lastPoint,
      mousePos,
      gridSize
    );

    elements.push(
      <Line
        key="predictive-line"
        points={[
          lastPoint.x,
          lastPoint.y,
          prediction.x,
          prediction.y,
        ]}
        stroke="#00ff00"
        strokeWidth={gridSize}
        opacity={0.5}
        dash={[5, 5]}
      />
    );
  }

  // Draw current path points
  points.forEach((point, index) => {
    elements.push(
      <Rect
        key={`preview-point-${index}`}
        x={point.x - gridSize / 2}
        y={point.y - gridSize / 2}
        width={gridSize}
        height={gridSize}
        fill="#00ff00"
        opacity={1}
      />
    );
  });

  return <Group>{elements}</Group>;
};

const DrawingCanvas = forwardRef<
  {
    startPathCreation: (sourceRoomId: string) => void;
  },
  {
    stageDimensions: { width: number; height: number };
    rooms: Room[];
    selectedRoomId: string | null;
    selectedPathId: string | null;
    onRoomSelect: (roomId: string | null) => void;
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
    onPathCreate?: (
      fromRoomId: string,
      toRoomId: string,
      anchors: Position[]
    ) => void;
    onPathCreateStart?: (sourceRoomId: string) => void;
  }
>(
  (
    {
      stageDimensions,
      rooms,
      selectedRoomId,
      selectedPathId,
      onRoomSelect,
      onRoomUpdate,
      onRoomCreate,
      onRoomDelete,
      gridSize = DEFAULT_CONFIG.gridSize,
      onPathCreate,
      onPathCreateStart,
    },
    ref
  ) => {
    const startPathCreation = useCallback((sourceRoomId: string) => {
      setPathState({
        stage: "selecting_destination",
        sourceRoomId,
        destinationRoomId: null,
        currentPoints: [],
      });
    }, []);

    // Expose startPathCreation function to parent
    useImperativeHandle(
      ref,
      () => ({
        startPathCreation,
      }),
      [startPathCreation]
    );
    const stageRef = useRef<any>(null);

    // Path creation state
    const [pathState, setPathState] = useState<PathCreationState>({
      stage: "idle",
      sourceRoomId: null,
      destinationRoomId: null,
      currentPoints: [],
    });

    // Mouse position for predictive line
    const [mousePos, setMousePos] = useState<Position>({
      x: 0,
      y: 0,
    });

    // Configuration
    const config = useMemo<DrawingCanvasConfig>(
      () => ({
        ...DEFAULT_CONFIG,
        gridSize,
      }),
      [gridSize]
    );

    // Custom hooks for different functionalities
    const {
      pendingRooms,
      updateRoomDoor,
      handleRoomDragEnd,
      handlePendingRoomDragEnd,
      deleteSelectedRoom,
      savePendingRooms,
      setPendingRooms,
    } = useRoomManagement(
      rooms,
      onRoomUpdate,
      selectedRoomId,
      onRoomSelect,
      onRoomDelete
    );

    const {
      isDrawing,
      startPos,
      currentPos,
      startDrawing,
      updateDrawing,
      finishDrawing,
    } = useDrawing(gridSize, (newRoom) => {
      setPendingRooms((prev) => [...prev, newRoom]);
    });

    const {
      panX,
      panY,
      zoom,
      handleWheel,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
    } = usePanZoom(config);

    // Keyboard event handling for delete
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          (e.key === "Delete" || e.key === "Backspace") &&
          selectedRoomId &&
          (e.metaKey || e.ctrlKey)
        ) {
          deleteSelectedRoom();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () =>
        window.removeEventListener("keydown", handleKeyDown);
    }, [selectedRoomId, deleteSelectedRoom]);

    // Generate grid lines
    const generateGrid = useCallback(() => {
      const lines = [];
      const { width: stageWidth, height: stageHeight } =
        stageDimensions;

      // Calculate visible area bounds considering pan offset and zoom
      const startX = Math.floor(-panX / zoom / gridSize) * gridSize;
      const endX =
        Math.ceil((-panX + stageWidth) / zoom / gridSize) * gridSize;
      const startY = Math.floor(-panY / zoom / gridSize) * gridSize;
      const endY =
        Math.ceil((-panY + stageHeight) / zoom / gridSize) * gridSize;

      // Vertical lines
      for (let x = startX; x <= endX; x += gridSize) {
        lines.push(
          <Line
            key={`v-${x}`}
            points={[x, startY, x, endY]}
            stroke={COLORS.grid}
            strokeWidth={1 / zoom}
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
            strokeWidth={1 / zoom}
          />
        );
      }
      return lines;
    }, [stageDimensions, panX, panY, zoom, gridSize]);

    const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // getPointerPosition() returns screen coordinates since Stage has no transformation
      // Convert to world coordinates by accounting for Group transformation
      const worldPos = screenToWorld(pos, panX, panY, zoom);

      // Check if we're in path creation mode
      if (pathState.stage !== "idle") {
        handlePathMouseDown(worldPos);
        return;
      }

      // Find clicked room (saved or pending) on border
      const clickedRoom = [...rooms, ...pendingRooms].find((room) =>
        isOnRoomBorder(worldPos, room, gridSize)
      );

      if (clickedRoom) {
        // Check if room has paths - if so, don't allow door editing
        const hasPaths =
          "fromPaths" in clickedRoom &&
          "toPaths" in clickedRoom &&
          Array.isArray(clickedRoom.fromPaths) &&
          Array.isArray(clickedRoom.toPaths)
            ? clickedRoom.fromPaths.length > 0 ||
              clickedRoom.toPaths.length > 0
            : false;

        if (!hasPaths) {
          // Clicked on wall border - set door position (only if no paths)
          updateRoomDoor(clickedRoom, worldPos, gridSize);
        }
        onRoomSelect(clickedRoom.id);
        return;
      }

      // Find clicked room interior
      const clickedRoomInterior = [...rooms, ...pendingRooms].find(
        (room) => isInRoomInterior(worldPos, room)
      );

      if (clickedRoomInterior) {
        onRoomSelect(clickedRoomInterior.id);
      } else {
        // Start drawing new room
        startDrawing(worldPos);
        onRoomSelect(null);
      }
    };

    const handlePathMouseDown = useCallback(
      (worldPos: Position) => {
        const snappedPos = snapToGridCenter(worldPos, gridSize);

        if (pathState.stage === "idle") {
          // Not creating a path yet - this shouldn't happen in mouse handler
          // Path creation should be initiated from sidebar button
        } else if (pathState.stage === "selecting_destination") {
          // Looking for destination room
          const clickedRoom = rooms.find((room) =>
            isInRoomInterior(snappedPos, room)
          );

          if (
            clickedRoom &&
            clickedRoom.id !== pathState.sourceRoomId
          ) {
            // Destination selected - immediately start drawing from source door
            const sourceRoom = rooms.find(
              (r) => r.id === pathState.sourceRoomId
            );
            if (
              sourceRoom &&
              sourceRoom.doorX !== null &&
              sourceRoom.doorY !== null
            ) {
              const sourceDoorPos = snapToGridCenter(
                {
                  x: sourceRoom.x + sourceRoom.doorX,
                  y: sourceRoom.y + sourceRoom.doorY,
                },
                gridSize
              );
              setPathState({
                stage: "drawing_path",
                sourceRoomId: pathState.sourceRoomId,
                destinationRoomId: clickedRoom.id,
                currentPoints: [sourceDoorPos], // Start immediately from source door
              });
              onRoomSelect(clickedRoom.id);
            }
          }
        } else if (pathState.stage === "drawing_path") {
          // Drawing path - handle door clicks
          const sourceRoom = rooms.find(
            (r) => r.id === pathState.sourceRoomId
          );
          const destRoom = rooms.find(
            (r) => r.id === pathState.destinationRoomId
          );

          if (sourceRoom && destRoom) {
            // Check if clicked on source door
            const clickedSourceDoor =
              sourceRoom.doorX !== null &&
              sourceRoom.doorY !== null &&
              Math.abs(
                sourceRoom.x + sourceRoom.doorX - snappedPos.x
              ) < gridSize &&
              Math.abs(
                sourceRoom.y + sourceRoom.doorY - snappedPos.y
              ) < gridSize;

            // Check if clicked on destination door
            const clickedDestDoor =
              destRoom.doorX !== null &&
              destRoom.doorY !== null &&
              Math.abs(destRoom.x + destRoom.doorX - snappedPos.x) <
                gridSize &&
              Math.abs(destRoom.y + destRoom.doorY - snappedPos.y) <
                gridSize;

            if (
              clickedSourceDoor &&
              pathState.currentPoints.length === 0
            ) {
              // Start drawing from source door
              setPathState((prev) => ({
                ...prev,
                currentPoints: [snappedPos],
              }));
            } else if (pathState.currentPoints.length > 0) {
              // Add waypoint - use orthogonal prediction for any click (including destination door)
              const lastPoint =
                pathState.currentPoints[
                  pathState.currentPoints.length - 1
                ];
              const orthogonalPos = getOrthogonalPrediction(
                lastPoint,
                worldPos,
                gridSize
              );

              // Check if this orthogonal position reaches the destination door
              const reachesDestDoor =
                clickedDestDoor &&
                Math.abs(
                  orthogonalPos.x - (destRoom.x + destRoom.doorX!)
                ) < gridSize &&
                Math.abs(
                  orthogonalPos.y - (destRoom.y + destRoom.doorY!)
                ) < gridSize;

              if (reachesDestDoor) {
                // Complete path - orthogonal segment reaches destination door
                const finalPoints = [
                  ...pathState.currentPoints,
                  orthogonalPos,
                ];
                if (
                  onPathCreate &&
                  pathState.sourceRoomId &&
                  pathState.destinationRoomId
                ) {
                  onPathCreate(
                    pathState.sourceRoomId,
                    pathState.destinationRoomId,
                    finalPoints
                  );
                }
                setPathState({
                  stage: "idle",
                  sourceRoomId: null,
                  destinationRoomId: null,
                  currentPoints: [],
                });
              } else {
                // Add waypoint and continue drawing
                setPathState((prev) => ({
                  ...prev,
                  currentPoints: [
                    ...prev.currentPoints,
                    orthogonalPos,
                  ],
                }));
              }
            }
          }
        }
      },
      [pathState, gridSize, rooms, onRoomSelect, onPathCreate]
    );

    const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Convert screen coordinates to world coordinates
      const worldPos = screenToWorld(pos, panX, panY, zoom);

      // Update mouse position for predictive line
      setMousePos(worldPos);

      updateDrawing(worldPos);
    };

    const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
      finishDrawing();
    };

    // Wrapper functions for drag handlers to match expected signature
    const handleRoomDragEndWrapper = useCallback(
      (e: KonvaEventObject<DragEvent>, room: Room) => {
        handleRoomDragEnd(e, room, gridSize);
      },
      [handleRoomDragEnd, gridSize]
    );

    const handlePendingRoomDragEndWrapper = useCallback(
      (e: KonvaEventObject<DragEvent>, room: PendingRoom) => {
        handlePendingRoomDragEnd(e, room, gridSize);
      },
      [handlePendingRoomDragEnd, gridSize]
    );

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
        {/* Save/Discard Buttons */}
        {pendingRooms.length > 0 && (
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button
              onClick={() => setPendingRooms([])}
              variant="outline"
              className="flex items-center gap-2"
            >
              Discard New Rooms
            </Button>
            <Button
              onClick={handleSave}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save New Rooms
            </Button>
          </div>
        )}

        <div className="w-full h-full">
          <Stage
            ref={stageRef}
            width={stageDimensions.width}
            height={stageDimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={(e) => handleWheel(e, stageRef.current)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <Layer>
              <Group x={panX} y={panY} scaleX={zoom} scaleY={zoom}>
                {/* Grid */}
                {generateGrid()}

                {/* Rooms */}
                {rooms.map((room) => (
                  <RoomComponent
                    key={room.id}
                    room={room}
                    selectedRoomId={selectedRoomId}
                    gridSize={gridSize}
                    onDragEnd={(e) =>
                      handleRoomDragEndWrapper(e, room)
                    }
                    onClick={() => onRoomSelect(room.id)}
                    isPathSource={pathState.sourceRoomId === room.id}
                    isPathDestination={
                      pathState.destinationRoomId === room.id
                    }
                    hasPaths={
                      room.fromPaths.length > 0 ||
                      room.toPaths.length > 0
                    }
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
                    onDragEnd={(e) =>
                      handlePendingRoomDragEndWrapper(e, room)
                    }
                    onClick={() => onRoomSelect(room.id)}
                    hasPaths={false}
                  />
                ))}

                {/* Path visualization */}
                {rooms.map((room) => (
                  <PathVisualization
                    key={`paths-${room.id}`}
                    paths={room.fromPaths}
                    selectedRoomId={selectedRoomId}
                    selectedPathId={selectedPathId}
                    gridSize={gridSize}
                  />
                ))}

                {/* Path creation preview */}
                {pathState.stage === "drawing_path" &&
                  pathState.currentPoints.length > 0 && (
                    <PathCreationPreview
                      points={pathState.currentPoints}
                      mousePos={mousePos}
                      gridSize={gridSize}
                    />
                  )}

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
              </Group>
            </Layer>
          </Stage>
        </div>
      </div>
    );
  }
);

export default DrawingCanvas;
