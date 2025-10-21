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
import { useState, useRef } from "react";
import type { EditMode } from "@sightmap/common";

export const Route = createFileRoute("/floors/$floorId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { floorId } = Route.useParams();
  const queryClient = useQueryClient();
  const drawingCanvasRef = useRef<{
    startPathCreation: (sourceRoomId: string) => void;
  } | null>(null);

  const [stageDimensions, setStageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    null
  );
  const [mode, setMode] = useState<EditMode>("room");

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

  const updateRoomName = useMutation(
    trpc.floor.updateRoomName.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({ floorId }),
        });
      },
    })
  );

  const createPath = useMutation(
    trpc.floor.createPath.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({ floorId }),
        });
      },
    })
  );

  const deletePath = useMutation(
    trpc.floor.deletePath.mutationOptions({
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
    // Deselect the room if it was selected
    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
    }
  };

  const handlePathCreateStart = (sourceRoomId: string) => {
    // Call the startPathCreation method on the DrawingCanvas ref
    if (drawingCanvasRef.current) {
      drawingCanvasRef.current.startPathCreation(sourceRoomId);
    }
  };

  const handlePathCreate = (
    fromRoomId: string,
    toRoomId: string,
    anchors: { x: number; y: number }[]
  ) => {
    createPath.mutate({
      fromRoomId,
      toRoomId,
      anchors,
    });
  };

  const handlePathDelete = (pathId: string) => {
    deletePath.mutate({ pathId });
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
    <div className="flex relative">
      {/* Dummy div to reserve space for the absolutely positioned sidebar */}
      <div className="w-80 flex-shrink-0"></div>
      <Sidebar
        rooms={floorData.data?.rooms || []}
        selectedRoomId={selectedRoomId}
        onRoomSelect={setSelectedRoomId}
        onRoomNameUpdate={(roomId, name) => {
          updateRoomName.mutate({ roomId, name });
        }}
        onRoomDelete={handleRoomDelete}
        onPathDelete={handlePathDelete}
        mode={mode}
        onModeChange={setMode}
        onPathCreateStart={handlePathCreateStart}
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
            ref={drawingCanvasRef}
            stageDimensions={stageDimensions}
            rooms={floorData.data?.rooms || []}
            selectedRoomId={selectedRoomId}
            onRoomSelect={setSelectedRoomId}
            onRoomUpdate={handleRoomUpdate}
            onRoomCreate={handleRoomCreate}
            onRoomDelete={handleRoomDelete}
            gridSize={20}
            mode={mode}
            onPathCreate={handlePathCreate}
          />
        ) : null}
      </div>
    </div>
  );
}
