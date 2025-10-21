import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { trpc, type RouterInputs } from "@/utils/trpc";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import DrawingCanvas from "@/components/drawing-canvas";
import Sidebar from "@/components/sidebar";
import { useState } from "react";

export const Route = createFileRoute("/floors/$floorId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { floorId } = Route.useParams();
  const queryClient = useQueryClient();

  const [stageDimensions, setStageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    null
  );

  const floorData = useQuery(
    trpc.floor.getFloorData.queryOptions({ floorId })
  );

  const updateRoomCoordinates = useMutation(
    trpc.floor.updateRoomCoordinates.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({ floorId }),
        });
      },
    })
  );

  const createRoom = useMutation(
    trpc.floor.createRoom.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({ floorId }),
        });
      },
    })
  );

  const deleteRoom = useMutation(
    trpc.floor.deleteRoom.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({ floorId }),
        });
      },
    })
  );

  const handleRoomUpdate = (
    input: RouterInputs["floor"]["updateRoomCoordinates"]
  ) => {
    updateRoomCoordinates.mutate(input);
  };

  const handleRoomCreate = (
    x: number,
    y: number,
    width: number,
    height: number,
    doorX?: number,
    doorY?: number
  ) => {
    const roomNumber = `Room ${
      (floorData.data?.rooms.length || 0) + 1
    }`;
    createRoom.mutate({
      floorId,
      name: roomNumber,
      number: roomNumber,
      x,
      y,
      width,
      height,
      doorX,
      doorY,
    });
  };

  const handleRoomDelete = (roomId: string) => {
    deleteRoom.mutate({ id: roomId });
  };

  if (floorData.isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (floorData.error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">
            Error
          </h2>
          <p className="text-gray-600">Failed to load floor data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar
        rooms={floorData.data?.rooms || []}
        selectedRoomId={selectedRoomId}
        onRoomSelect={setSelectedRoomId}
      />
      <div
        className="flex-1"
        ref={(el) => {
          if (
            el &&
            (!stageDimensions.width || !stageDimensions.height)
          ) {
            setStageDimensions({
              width: el.clientWidth,
              height: el.clientHeight,
            });
          }
        }}
      >
        {stageDimensions.width ? (
          <DrawingCanvas
            stageDimensions={stageDimensions}
            rooms={floorData.data?.rooms || []}
            onRoomUpdate={handleRoomUpdate}
            onRoomCreate={handleRoomCreate}
            onRoomDelete={handleRoomDelete}
            gridSize={20}
          />
        ) : null}
      </div>
    </div>
  );
}
