// Route: /floors/$floorId
import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "../../utils/trpc";
import DrawingCanvas from "../../components/DrawingCanvas";

export const Route = createFileRoute("/floors/$floorId")({
  component: FloorMap,
});

function FloorMap() {
  const { floorId } = Route.useParams();
  const floorQuery = useQuery(
    trpc.building.getFloorDetails.queryOptions({ id: floorId })
  );
  // Move useMutation to top-level, before any return
  const updateRoom = useMutation(
    trpc.building.updateRoomCoordinates.mutationOptions()
  );

  if (floorQuery.isLoading) return <div>Loading...</div>;
  if (floorQuery.error || !floorQuery.data)
    return <div>Error loading floor data.</div>;

  const data = floorQuery.data;

  // Map Room[] to Rectangle[]
  const rectangles =
    data.rooms?.map(
      (room): import("../../types/shapes").Rectangle => ({
        id: room.id,
        type: "rectangle",
        x: room.startXCoords,
        y: room.startYCoords,
        width: room.endXCoords - room.startXCoords,
        height: room.endYCoords - room.startYCoords,
        text: room.name,
        fill: "#f5f5f5",
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })
    ) || [];

  const handleSave = (
    mapData: import("../../types/shapes").MapData
  ) => {
    (mapData.shapes as import("../../types/shapes").Rectangle[])
      .filter((shape) => shape.type === "rectangle")
      .forEach((rect) => {
        updateRoom.mutate({
          id: rect.id,
          startXCoords: rect.x,
          startYCoords: rect.y,
          endXCoords: rect.x + rect.width,
          endYCoords: rect.y + rect.height,
        });
      });
  };

  return (
    <div>
      <h2>Floor: {data.name}</h2>
      <DrawingCanvas
        key={floorId}
        initialData={{ shapes: rectangles, zoom: 1 }}
        onSave={handleSave}
      />
    </div>
  );
}
