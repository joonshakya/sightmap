import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import DrawingCanvas from "@/components/DrawingCanvas";
import type { MapData, Rectangle, Arrow } from "@/types/shapes";

export const Route = createFileRoute("/floors/$floorId")({
  component: FloorMap,
});

function FloorMap() {
  const { floorId } = Route.useParams();

  // Use the new getFloorData procedure that returns DrawingCanvas-compatible data
  const floorQuery = useQuery(
    trpc.floor.getFloorData.queryOptions({ floorId })
  );

  // Use the new saveFloor procedure for atomic saves
  const saveFloor = useMutation(
    trpc.floor.saveFloor.mutationOptions()
  );

  if (floorQuery.isLoading) return <div>Loading...</div>;
  if (floorQuery.error || !floorQuery.data)
    return <div>Error loading floor data.</div>;

  const data = floorQuery.data;

  const handleSave = (mapData: MapData) => {
    // Separate rectangles (rooms) and arrows (paths)
    const rectangles = mapData.shapes.filter(
      (shape): shape is Rectangle => shape.type === "rectangle"
    );
    const arrows = mapData.shapes.filter(
      (shape): shape is Arrow => shape.type === "arrow"
    );

    // Convert shapes back to room and path data
    // Use original room data where possible, update with new positions
    const rooms = rectangles.map((rect) => {
      // Find the original room data to preserve name, number, and door coordinates
      const originalRoom = data.rooms.find(
        (room) => room.id === rect.id
      );

      if (originalRoom) {
        // Update existing room with new position/size
        return {
          name: originalRoom.name,
          number: originalRoom.number,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          doorX: originalRoom.doorX, // Keep original door position
          doorY: originalRoom.doorY,
        };
      } else {
        // New room - parse from text
        const textMatch = rect.text.match(/^(.+?)\s*\(([^)]+)\)$/);
        const name = textMatch
          ? textMatch[1].trim()
          : rect.text || "Room";
        const number = textMatch ? textMatch[2].trim() : "1";

        // Use center of room as door position
        const doorX = rect.x + rect.width / 2;
        const doorY = rect.y + rect.height / 2;

        return {
          name,
          number,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          doorX,
          doorY,
        };
      }
    });

    // Convert arrows back to paths
    const paths = arrows
      .map((arrow) => {
        // Find the original path data
        const originalPath = data.paths.find(
          (path) => path.id === arrow.id
        );

        if (originalPath) {
          // Find the indices of the from and to rooms in the rooms array
          const fromRoomIndex = rooms.findIndex(
            (room) =>
              room.name === originalPath.fromRoom.name &&
              room.number === originalPath.fromRoom.number
          );
          const toRoomIndex = rooms.findIndex(
            (room) =>
              room.name === originalPath.toRoom.name &&
              room.number === originalPath.toRoom.number
          );

          if (fromRoomIndex === -1 || toRoomIndex === -1) {
            console.warn(
              "Could not find room indices for path",
              originalPath
            );
            return null;
          }

          // Update existing path - keep original structure but update anchors if needed
          return {
            fromRoomIndex,
            toRoomIndex,
            anchors: originalPath.anchors.map((anchor, index) => ({
              index,
              xCoords: anchor.xCoords,
              yCoords: anchor.yCoords,
            })),
            instructionSet: originalPath.instructionSet
              ? {
                  descriptiveInstructions:
                    originalPath.instructionSet
                      .descriptiveInstructions,
                  conciseInstructions:
                    originalPath.instructionSet.conciseInstructions,
                }
              : undefined,
          };
        } else {
          // New path - try to determine which rooms it connects based on arrow endpoints
          const [startX, startY, endX, endY] = arrow.points;

          // Find rooms closest to the arrow endpoints
          const findClosestRoomIndex = (x: number, y: number) => {
            let closestIndex = -1;
            let closestDistance = Infinity;

            rooms.forEach((room, index) => {
              const distance = Math.sqrt(
                Math.pow(room.doorX - x, 2) +
                  Math.pow(room.doorY - y, 2)
              );
              if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
              }
            });

            return closestIndex;
          };

          const fromRoomIndex = findClosestRoomIndex(startX, startY);
          const toRoomIndex = findClosestRoomIndex(endX, endY);

          if (fromRoomIndex === -1 || toRoomIndex === -1) {
            console.warn(
              "Could not determine room connections for new path",
              arrow
            );
            return null;
          }

          // Create new path with basic anchor
          return {
            fromRoomIndex,
            toRoomIndex,
            anchors: [
              {
                index: 0,
                xCoords: endX,
                yCoords: endY,
              },
            ],
          };
        }
      })
      .filter(Boolean) as any[]; // Remove nulls

    // Save everything atomically
    saveFloor.mutate({
      floorId,
      rooms,
      paths,
    });
  };

  return (
    <div>
      <h2>Floor: {data.floor.level}</h2>
      <DrawingCanvas
        key={floorId}
        initialData={{
          shapes: data.shapes,
          zoom: data.zoom,
        }}
        onSave={handleSave}
      />
    </div>
  );
}
