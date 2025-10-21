import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Route, Trash2 } from "lucide-react";
import type { RouterOutputs } from "@/utils/trpc";

type Room = RouterOutputs["floor"]["getFloorData"]["rooms"][number];
type Path = Room["fromPaths"][number];

interface SidebarProps {
  rooms: Room[];
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string | null) => void;
  onRoomNameUpdate: (roomId: string, name: string) => void;
  onRoomDelete?: (roomId: string) => void;
  className?: string;
}

type Screen = "rooms" | "details";

const getConnectedPaths = (room: Room) => {
  const fromPaths = room.fromPaths || [];
  const toPaths = room.toPaths || [];
  return [...fromPaths, ...toPaths];
};

export default function Sidebar({
  rooms,
  selectedRoomId,
  onRoomSelect,
  onRoomNameUpdate,
  onRoomDelete,
  className = "",
}: SidebarProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>("rooms");
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasUserBlurredRef = useRef(false);

  const selectedRoom = rooms.find(
    (room) => room.id === selectedRoomId
  );

  // Automatically switch to details screen when a room is selected
  useEffect(() => {
    if (selectedRoomId) {
      setCurrentScreen("details");
    } else {
      setCurrentScreen("rooms");
    }
  }, [selectedRoomId]);

  useEffect(() => {
    if (
      selectedRoom &&
      currentScreen === "details" &&
      textareaRef.current
    ) {
      // Focus and select all text when room details screen is open and a room is selected
      // Use setTimeout to ensure the textarea is fully rendered
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 0);
    }
  }, [selectedRoom?.id, currentScreen]);

  const handleRoomClick = (room: Room) => {
    onRoomSelect(room.id);
    setCurrentScreen("details");
  };

  const handleBackToRooms = () => {
    setCurrentScreen("rooms");
    onRoomSelect(null);
  };

  const handleNameChange = (newName: string) => {
    if (!selectedRoom) return;
    // Update the cache directly
    queryClient.setQueryData(
      trpc.floor.getFloorData.queryKey({
        floorId: selectedRoom.floorId,
      }),
      (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          rooms: oldData.rooms.map((r: Room) =>
            r.id === selectedRoom.id ? { ...r, name: newName } : r
          ),
        };
      }
    );
  };

  const handleNameBlur = () => {
    if (!selectedRoom) return;
    hasUserBlurredRef.current = true;
    const trimmedName = selectedRoom.name.trim();
    onRoomNameUpdate(selectedRoom.id, trimmedName);
    toast.success(`Room name updated to "${trimmedName}"`);
  };

  const handleNameKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameBlur();
    }
  };

  return (
    <div
      className={`w-80 bg-gray-50 border-r border-gray-200 h-full absolute overflow-y-auto ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 flex-1">
          {currentScreen === "details" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToRooms}
              className="p-1 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {currentScreen === "rooms" ? (
            <h2 className="text-lg font-semibold">Rooms</h2>
          ) : selectedRoom ? (
            <Textarea
              ref={textareaRef}
              value={selectedRoom.name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={handleNameKeyDown}
              className="flex-1 text-2xl font-semibold border-none bg-transparent p-2 h-auto focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 resize-none min-h-[2rem] max-h-[6rem] overflow-hidden"
              rows={1}
            />
          ) : (
            <h2 className="text-lg font-semibold">Room Details</h2>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {currentScreen === "rooms" ? (
          <RoomListScreen
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onRoomClick={handleRoomClick}
          />
        ) : selectedRoom ? (
          <RoomDetailsScreen
            room={selectedRoom}
            onRoomDelete={onRoomDelete}
          />
        ) : null}
      </div>
    </div>
  );
}

interface RoomListScreenProps {
  rooms: Room[];
  selectedRoomId: string | null;
  onRoomClick: (room: Room) => void;
}

function RoomListScreen({
  rooms,
  selectedRoomId,
  onRoomClick,
}: RoomListScreenProps) {
  return (
    <div className="space-y-2">
      {rooms.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No rooms created yet</p>
          <p className="text-sm">
            Draw rooms on the canvas to get started
          </p>
        </div>
      ) : (
        rooms.map((room) => (
          <Card
            key={room.id}
            className="cursor-pointer transition-colors hover:bg-gray-100"
            onClick={() => onRoomClick(room)}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{room.name}</h3>
                  <p className="text-sm text-gray-600">
                    {room.number}
                  </p>
                </div>
                <Badge variant="secondary">
                  {getConnectedPaths(room).length} paths
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

interface RoomDetailsScreenProps {
  room: Room;
  onRoomDelete?: (roomId: string) => void;
}

function RoomDetailsScreen({
  room,
  onRoomDelete,
}: RoomDetailsScreenProps) {
  const connectedPaths = getConnectedPaths(room);

  return (
    <div className="space-y-4">
      {/* Room Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Room Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium">Number:</span>{" "}
              {room.number}
            </div>
            <div>
              <span className="font-medium">Position:</span> ({room.x}
              , {room.y})
            </div>
            <div>
              <span className="font-medium">Size:</span> {room.width}{" "}
              × {room.height}
            </div>
            {room.doorX !== null && room.doorY !== null && (
              <div>
                <span className="font-medium">Door:</span> (
                {room.doorX}, {room.doorY})
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Connected Paths */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="h-4 w-4" />
            Connected Paths ({connectedPaths.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {connectedPaths.length === 0 ? (
            <p className="text-sm text-gray-500">
              No paths connected to this room
            </p>
          ) : (
            <div className="space-y-3">
              {connectedPaths.map((path) => {
                const isFromRoom = path.fromRoomId === room.id;
                const connectedRoom = isFromRoom
                  ? path.toRoom
                  : path.fromRoom;
                const direction = isFromRoom ? "→" : "←";

                return (
                  <div
                    key={path.id}
                    className="border border-gray-200 rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            isFromRoom ? "default" : "secondary"
                          }
                        >
                          {direction}
                        </Badge>
                        <span className="font-medium text-sm">
                          {connectedRoom.name} ({connectedRoom.number}
                          )
                        </span>
                      </div>
                      <Badge variant="outline">
                        {path.anchors?.length || 0} points
                      </Badge>
                    </div>

                    {path.instructionSet && (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-600">
                          <strong>Instructions:</strong>
                        </div>
                        <div className="text-xs">
                          {path.instructionSet
                            .descriptiveInstructions?.[0] ||
                            path.instructionSet
                              .conciseInstructions?.[0] ||
                            "No instructions available"}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Room */}
      {onRoomDelete && (
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <Button
              variant="destructive"
              onClick={() => onRoomDelete(room.id)}
              className="w-full flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Room
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
