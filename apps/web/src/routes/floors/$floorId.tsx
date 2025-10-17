import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import DrawingCanvas from "@/components/DrawingCanvas";
import type { MapData, Rectangle } from "@/types/shapes";

export const Route = createFileRoute("/floors/$floorId")({
  component: FloorMap,
});

function FloorMap() {
  const { floorId } = Route.useParams();
  const floorQuery = useQuery(
    trpc.floor.getById.queryOptions({ id: floorId })
  );
  // Move useMutation to top-level, before any return
  const updateRoom = useMutation(
    trpc.floor.updateRoomCoordinates.mutationOptions()
  );

  if (floorQuery.isLoading) return <div>Loading...</div>;
  if (floorQuery.error || !floorQuery.data)
    return <div>Error loading floor data.</div>;

  const data = floorQuery.data;

  // Map Room[] to Rectangle[]
  const rectangles =
    data.rooms?.map(
      (room): Rectangle => ({
        id: room.id,
        type: "rectangle",
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        text: room.name,
        fill: "#f5f5f5",
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })
    ) || [];

  const handleSave = (mapData: MapData) => {
    (mapData.shapes as Rectangle[])
      .filter((shape) => shape.type === "rectangle")
      .forEach((rect) => {
        updateRoom.mutate({
          id: rect.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      });
  };

  return (
    <div>
      <h2>Floor: {data.level}</h2>
      <DrawingCanvas
        key={floorId}
        initialData={{ shapes: rectangles, zoom: 1 }}
        onSave={handleSave}
      />
    </div>
  );
}
