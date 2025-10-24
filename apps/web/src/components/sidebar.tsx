import React, { useState, useEffect, useRef } from "react";
import {
  useQueryClient,
  useQuery,
  useMutation,
} from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import { useCompletion } from "@ai-sdk/react";
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
import {
  ArrowLeft,
  MapPin,
  Route,
  Trash2,
  Loader2,
} from "lucide-react";
import type { RouterOutputs } from "@/utils/trpc";
import type { EditMode } from "@sightmap/common";
import type { StepSize } from "@sightmap/common/prisma/enums";

// Utility function to adjust steps based on user preference
function adjustStepsForUser(
  text: string,
  stepSize: StepSize
): string {
  const multipliers: Record<StepSize, number> = {
    SMALL: 0.7,
    MEDIUM: 1.0,
    LARGE: 1.3,
  };

  return text.replace(/\{\{(\d+)\}\}/g, (match, stepNumber) => {
    const adjusted = Math.round(
      parseInt(stepNumber) * multipliers[stepSize]
    );
    return `{{${adjusted}}}`;
  });
}

type Room = RouterOutputs["floor"]["getFloorData"]["rooms"][number];
type Path = Room["fromPaths"][number];

interface SidebarProps {
  rooms: Room[];
  selectedRoomId: string | null;
  selectedPathId: string | null;
  onRoomSelect: (roomId: string | null) => void;
  onPathSelect: (pathId: string | null) => void;
  onRoomNameUpdate: (roomId: string, name: string) => void;
  onRoomDelete?: (roomId: string) => void;
  onPathDelete?: (pathId: string) => void;
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  onPathCreateStart?: (sourceRoomId: string) => void;
  className?: string;
}

type Screen = "rooms" | "details" | "instructions";

const getConnectedPaths = (room: Room) => {
  const fromPaths = room.fromPaths || [];
  const toPaths = room.toPaths || [];
  return [...fromPaths, ...toPaths];
};

export default function Sidebar({
  rooms,
  selectedRoomId,
  selectedPathId,
  onRoomSelect,
  onPathSelect,
  onRoomNameUpdate,
  onRoomDelete,
  onPathDelete,
  mode,
  onModeChange,
  onPathCreateStart,
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
      className={`w-96 bg-gray-50 border-r border-gray-200 h-full absolute overflow-y-auto ${className}`}
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
            mode={mode}
            onModeChange={onModeChange}
          />
        ) : currentScreen === "details" && selectedRoom ? (
          <RoomDetailsScreen
            room={selectedRoom}
            onPathSelect={(pathId) => {
              onPathSelect(pathId);
              setCurrentScreen("instructions");
            }}
            onRoomDelete={onRoomDelete}
            onPathDelete={onPathDelete}
            mode={mode}
            onPathCreateStart={onPathCreateStart}
          />
        ) : currentScreen === "instructions" && selectedPathId ? (
          <InstructionsScreen
            pathId={selectedPathId}
            onBack={() => {
              setCurrentScreen("details");
              onPathSelect(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

interface InstructionsScreenProps {
  pathId: string;
  onBack: () => void;
}

interface InstructionResponse {
  instruction: string;
  steps: Array<{
    direction: "forward" | "backward" | "left" | "right";
    steps: number;
    nearbyRooms?: string[];
  }>;
}

function InstructionsScreen({
  pathId,
  onBack,
}: InstructionsScreenProps) {
  const { completion, complete, isLoading } = useCompletion({
    api: `${import.meta.env.VITE_SERVER_URL}/generate-instructions`,
  });

  // Fetch user settings for step size preference
  const { data: userSettings } = useQuery(
    trpc.userSettings.get.queryOptions()
  );

  // Save instructions mutation
  const saveInstructionsMutation = useMutation(
    trpc.floor.saveInstructions.mutationOptions({
      onSuccess: () => {
        toast.success("Instructions saved successfully!");
      },
      onError: (error) => {
        toast.error("Failed to save instructions: " + error.message);
      },
    })
  );

  const handleGenerateInstructions = () => {
    complete(JSON.stringify({ pathId }));
  };

  // Parse completion content with delimiters - incremental parsing
  const parseCompletionContent = (content: string) => {
    // Extract steps incrementally - don't wait for STEPS_END
    const stepsSection =
      content.match(/SSTART\s*\n([\s\S]*?)(SEND|$)/)?.[1] || "";
    const steps = stepsSection
      .split("\n")
      .filter((line) => line.startsWith("STEP:"))
      .map((line) => line.replace("STEP: ", "").trim());

    // Extract concise instructions
    const conciseSection =
      content.match(/C:\s*\n([\s\S]*?)(EC|$)/)?.[1] || "";
    const conciseInstructions = conciseSection
      .split("\n")
      .filter((line) => line.trim());

    return { steps, conciseInstructions };
  };

  const parsedData = parseCompletionContent(completion);

  const handleSaveInstructions = () => {
    if (!parsedData.steps.length) return;

    // Descriptive instructions: AI-generated full sentences (steps)
    const descriptiveInstructions = parsedData.steps;

    // Concise instructions: movement segments from AI response
    const conciseInstructions = parsedData.conciseInstructions || [];

    saveInstructionsMutation.mutate({
      pathId,
      descriptiveInstructions,
      conciseInstructions,
    });
  };

  // Apply step size adjustment to steps (parse {{step_number}} from text)
  const adjustedSteps = parsedData.steps.map((stepText) => {
    // Extract step number from {{number}} format
    const stepMatch = stepText.match(/\{\{(\d+)\}\}/);
    const stepNumber = stepMatch ? parseInt(stepMatch[1]) : 0;

    const adjustedStepNumber = userSettings?.stepSize
      ? Math.round(
          stepNumber *
            (userSettings.stepSize === "SMALL"
              ? 1.4 // Small steps = more steps needed
              : userSettings.stepSize === "LARGE"
              ? 0.7 // Large steps = fewer steps needed
              : 1.0) // Medium steps = normal
        )
      : stepNumber;

    // Replace {{number}} with adjusted number
    return stepText.replace(
      /\{\{(\d+)\}\}/,
      adjustedStepNumber.toString()
    );
  });

  // Apply step size adjustment to concise instructions
  const adjustedConciseInstructions =
    parsedData.conciseInstructions?.map((conciseText) => {
      // Extract step number from {{number}} format
      const stepMatch = conciseText.match(/\{\{(\d+)\}\}/);
      const stepNumber = stepMatch ? parseInt(stepMatch[1]) : 0;

      const adjustedStepNumber = userSettings?.stepSize
        ? Math.round(
            stepNumber *
              (userSettings.stepSize === "SMALL"
                ? 1.4 // Small steps = more steps needed
                : userSettings.stepSize === "LARGE"
                ? 0.7 // Large steps = fewer steps needed
                : 1.0) // Medium steps = normal
          )
        : stepNumber;

      // Replace {{number}} with adjusted number
      return conciseText.replace(
        /\{\{(\d+)\}\}/,
        adjustedStepNumber.toString()
      );
    }) || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base">
              Path Instructions
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Instructions Display */}
            <div className="border border-gray-200 rounded-lg p-4 bg-white min-h-[200px]">
              {!parsedData.steps.length ? (
                <p className="text-sm text-gray-500">
                  Click "Generate Instructions" to create navigation
                  instructions for this path.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Descriptive Instructions */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2">
                      Descriptive Instructions:
                    </h4>
                    <div className="space-y-1">
                      {adjustedSteps.map((stepText, index) => (
                        <div
                          key={index}
                          className="text-sm text-gray-700"
                        >
                          {index + 1}. {stepText}
                          {isLoading &&
                          index === adjustedSteps.length - 1 &&
                          adjustedConciseInstructions.length === 0 ? (
                            <span
                              style={{
                                fontSize: "1.0em",
                                fontWeight: "bold",
                              }}
                            >
                              {" "}
                              ●
                            </span>
                          ) : (
                            ""
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Concise Instructions */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2">
                      Concise Instructions:
                    </h4>
                    <div className="space-y-1">
                      {adjustedConciseInstructions.map(
                        (line, index) => (
                          <div
                            key={index}
                            className="text-sm text-gray-700"
                          >
                            {line}
                            {isLoading &&
                            index ===
                              adjustedConciseInstructions.length -
                                1 ? (
                              <span
                                style={{
                                  fontSize: "1.0em",
                                  fontWeight: "bold",
                                }}
                              >
                                {" "}
                                ●
                              </span>
                            ) : (
                              ""
                            )}
                          </div>
                        )
                      ) || (
                        <div className="text-sm text-gray-500">
                          No concise instructions available
                        </div>
                      )}
                    </div>
                  </div>

                  {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating instructions...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleGenerateInstructions}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  "Generate Instructions"
                )}
              </Button>

              {parsedData.steps.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSaveInstructions}
                  disabled={saveInstructionsMutation.isPending}
                >
                  {saveInstructionsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    "Save Instructions"
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
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
  mode,
  onModeChange,
}: RoomListScreenProps & {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Edit Mode</span>
            <div className="flex gap-1">
              <Button
                variant={mode === "room" ? "default" : "outline"}
                size="sm"
                onClick={() => onModeChange("room")}
                className="text-xs"
              >
                Room
              </Button>
              <Button
                variant={mode === "path" ? "default" : "outline"}
                size="sm"
                onClick={() => onModeChange("path")}
                className="text-xs"
              >
                Path
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rooms List */}
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
    </div>
  );
}

interface RoomDetailsScreenProps {
  room: Room;
  onPathSelect?: (pathId: string) => void;
  onRoomDelete?: (roomId: string) => void;
  onPathDelete?: (pathId: string) => void;
  mode?: EditMode;
  onPathCreateStart?: (sourceRoomId: string) => void;
}

function RoomDetailsScreen({
  room,
  onPathSelect,
  onRoomDelete,
  onPathDelete,
  mode,
  onPathCreateStart,
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Route className="h-4 w-4" />
              Connected Paths ({connectedPaths.length})
            </CardTitle>
            {mode === "path" && onPathCreateStart && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPathCreateStart(room.id)}
                className="flex items-center gap-2"
              >
                <Route className="h-3 w-3" />
                Create Path
              </Button>
            )}
          </div>
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
                    className={`border border-gray-200 rounded-lg p-3 bg-white ${
                      onPathSelect
                        ? "cursor-pointer hover:bg-gray-50"
                        : ""
                    }`}
                    onClick={() =>
                      onPathSelect && onPathSelect(path.id)
                    }
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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {path.anchors?.length || 0} points
                        </Badge>
                        {onPathDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onPathDelete(path.id)}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
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
