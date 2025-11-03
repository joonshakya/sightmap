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
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  MapPin,
  Route,
  Trash2,
  Loader2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { RouterOutputs } from "@/utils/trpc";

import type { StepSize } from "@sightmap/common/prisma/enums";

// Helper function to adjust step numbers in instruction text
function adjustInstructionText(
  text: string,
  stepSize?: StepSize
): string {
  if (!stepSize) return text;

  const multipliers: Record<StepSize, number> = {
    SMALL: 1.4, // Small steps = more steps needed
    MEDIUM: 1.0, // Medium steps = normal
    LARGE: 0.7, // Large steps = fewer steps needed
  };

  const stepMatch = text.match(/\{\{(\d+)\}\}/);
  const stepNumber = stepMatch ? parseInt(stepMatch[1]) : 0;

  const adjustedStepNumber = Math.round(
    stepNumber * multipliers[stepSize]
  );

  // First replace {{number}} with adjusted number, then remove remaining unpaired { and }
  let cleanedText = text.replace(
    /\{\{(\d+)\}\}/,
    adjustedStepNumber.toString()
  );
  // Remove any remaining unpaired { and }
  cleanedText = cleanedText.replace(/[{}]/g, "");

  return cleanedText;
}

type Room = RouterOutputs["floor"]["getFloorData"]["rooms"][number];
type Path = Room["fromPaths"][number];

type Position = { x: number; y: number };

interface SidebarProps {
  rooms: Room[];
  selectedRoomId: string | null;
  selectedPathId: string | null;
  onRoomSelect: (roomId: string | null) => void;
  onPathSelect: (pathId: string | null) => void;
  onRoomNameUpdate: (roomId: string, name: string) => void;
  onRoomDelete?: (roomId: string) => void;
  onPathDelete?: (pathId: string) => void;
  onPathCreateStart?: (sourceRoomId: string) => void;
  pathCreationState?:
    | "idle"
    | "selecting_destination"
    | "drawing_path";
  onPathCreateCancel?: () => void;
  currentPathPoints?: Position[];
  onUndoLastPoint?: () => void;
  className?: string;
}

type Screen = "rooms" | "details" | "instructions";

const findPathById = (rooms: Room[], pathId: string) => {
  for (const room of rooms) {
    const fromPath = room.fromPaths.find((p) => p.id === pathId);
    if (fromPath) return fromPath;
    const toPath = room.toPaths.find((p) => p.id === pathId);
    if (toPath) return toPath;
  }
  return null;
};

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
  onPathCreateStart,
  pathCreationState = "idle",
  onPathCreateCancel,
  currentPathPoints = [],
  onUndoLastPoint,
  className = "",
}: SidebarProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>("rooms");
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasUserBlurredRef = useRef(false);
  const navigate = useNavigate();

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

  const handleBackToDetails = () => {
    setCurrentScreen("details");
    onPathSelect(null);
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
      className={`w-[26rem] bg-gray-50 border-r border-gray-200 h-full absolute overflow-y-auto ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 flex-1">
          {currentScreen === "rooms" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/" })}
              className="p-1 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {(currentScreen === "details" ||
            currentScreen === "instructions") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={
                currentScreen === "details"
                  ? handleBackToRooms
                  : handleBackToDetails
              }
              className="p-1 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {currentScreen === "rooms" ? (
            <h2 className="text-lg font-semibold">Rooms</h2>
          ) : currentScreen === "instructions" && selectedPathId ? (
            (() => {
              const selectedPath = findPathById(
                rooms,
                selectedPathId
              );
              return selectedPath ? (
                <h2 className="text-lg font-semibold">
                  {selectedPath.fromRoom.name} →{" "}
                  {selectedPath.toRoom.name}
                </h2>
              ) : (
                <h2 className="text-lg font-semibold">
                  Path Instructions
                </h2>
              );
            })()
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
        {pathCreationState === "selecting_destination" ? (
          <PathCreationNoticeScreen
            message="Choose a destination room"
            onCancel={onPathCreateCancel}
          />
        ) : pathCreationState === "drawing_path" ? (
          <PathCreationNoticeScreen
            message="Click to add anchor points"
            onCancel={onPathCreateCancel}
            onUndo={
              currentPathPoints.length > 1
                ? onUndoLastPoint
                : undefined
            }
          />
        ) : currentScreen === "rooms" ? (
          <RoomListScreen
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onRoomClick={handleRoomClick}
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
            onPathCreateStart={onPathCreateStart}
          />
        ) : currentScreen === "instructions" && selectedPathId ? (
          (() => {
            const selectedPath = findPathById(rooms, selectedPathId);
            return selectedPath ? (
              <InstructionsScreen
                path={selectedPath}
                onBack={() => {
                  setCurrentScreen("details");
                  onPathSelect(null);
                }}
              />
            ) : null;
          })()
        ) : null}
      </div>
    </div>
  );
}

interface InstructionsScreenProps {
  path: Path;
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
  path,
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
      onSuccess(data, variables, onMutateResult, context) {
        toast.success("Instructions saved successfully!");
        context.client.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({
            floorId: path.fromRoom.floorId,
          }),
        });
      },
      onError: (error) => {
        toast.error("Failed to save instructions: " + error.message);
      },
    })
  );

  const handleGenerateInstructions = () => {
    complete(JSON.stringify({ pathId: path.id }));
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
      pathId: path.id,
      descriptiveInstructions,
      conciseInstructions,
    });
  };

  // Apply step size adjustment to steps
  const adjustedSteps = parsedData.steps.map((stepText) =>
    adjustInstructionText(stepText, userSettings?.stepSize)
  );

  // Apply step size adjustment to concise instructions
  const adjustedConciseInstructions =
    parsedData.conciseInstructions?.map((conciseText) =>
      adjustInstructionText(conciseText, userSettings?.stepSize)
    ) || [];

  // Check if path already has saved instructions
  const hasSavedInstructions =
    path.instructionSet &&
    ((path.instructionSet.descriptiveInstructions &&
      path.instructionSet.descriptiveInstructions.length > 0) ||
      (path.instructionSet.conciseInstructions &&
        path.instructionSet.conciseInstructions.length > 0));

  // Apply step size adjustment to saved instructions
  const adjustedSavedSteps = hasSavedInstructions
    ? (path.instructionSet!.descriptiveInstructions || []).map(
        (stepText) =>
          adjustInstructionText(stepText, userSettings?.stepSize)
      )
    : [];

  const adjustedSavedConciseInstructions = hasSavedInstructions
    ? (path.instructionSet!.conciseInstructions || []).map(
        (conciseText) =>
          adjustInstructionText(conciseText, userSettings?.stepSize)
      )
    : [];

  // Use streaming content when loading, otherwise use saved instructions if available
  const displaySteps = isLoading
    ? adjustedSteps
    : hasSavedInstructions
    ? adjustedSavedSteps
    : adjustedSteps;

  const displayConciseInstructions = isLoading
    ? adjustedConciseInstructions
    : hasSavedInstructions
    ? adjustedSavedConciseInstructions
    : adjustedConciseInstructions;

  // Check if current generated instructions are different from saved ones
  const hasUnsavedChanges =
    !isLoading &&
    parsedData.steps.length > 0 &&
    (!hasSavedInstructions ||
      JSON.stringify(adjustedSteps) !==
        JSON.stringify(adjustedSavedSteps) ||
      JSON.stringify(adjustedConciseInstructions) !==
        JSON.stringify(adjustedSavedConciseInstructions));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Path Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Instructions Display */}
            <div className="border border-gray-200 rounded-lg p-4 bg-white min-h-[200px]">
              {!hasSavedInstructions && !parsedData.steps.length ? (
                <p className="text-sm text-gray-500">
                  Click "Generate Instructions" to create navigation
                  instructions for this path.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Descriptive Instructions */}
                  {displaySteps.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">
                        Descriptive Instructions:
                      </h4>
                      <div className="space-y-1">
                        {displaySteps.map((stepText, index) => (
                          <div
                            key={index}
                            className="text-sm text-gray-700"
                          >
                            {index + 1}. {stepText}
                            {isLoading &&
                            index === displaySteps.length - 1 &&
                            displayConciseInstructions.length ===
                              0 ? (
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
                  )}

                  {/* Concise Instructions */}
                  {displayConciseInstructions.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">
                        Concise Instructions:
                      </h4>
                      <div className="space-y-1">
                        {displayConciseInstructions.map(
                          (line, index) => (
                            <div
                              key={index}
                              className="text-sm text-gray-700"
                            >
                              {line}
                              {isLoading &&
                              index ===
                                displayConciseInstructions.length -
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
                        )}
                      </div>
                    </div>
                  )}

                  {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {hasSavedInstructions
                        ? "Regenerating instructions..."
                        : "Generating instructions..."}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {!hasSavedInstructions && (
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
              )}

              {hasSavedInstructions && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGenerateInstructions}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Regenerating...
                    </>
                  ) : (
                    "Regenerate Instructions"
                  )}
                </Button>
              )}

              {hasUnsavedChanges && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSaveInstructions}
                  disabled={saveInstructionsMutation.isPending}
                >
                  {saveInstructionsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {hasSavedInstructions
                        ? "Updating..."
                        : "Saving..."}
                    </>
                  ) : hasSavedInstructions ? (
                    "Update Instructions"
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
}: RoomListScreenProps) {
  return (
    <div className="space-y-4">
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
              <CardContent className="px-3">
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

interface PathCreationNoticeScreenProps {
  message: string;
  onCancel?: () => void;
  onUndo?: () => void;
}

function PathCreationNoticeScreen({
  message,
  onCancel,
  onUndo,
}: PathCreationNoticeScreenProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="text-lg font-medium text-gray-900">
              {message}
            </div>
            <div className="space-y-2">
              {onUndo && (
                <Button
                  variant="outline"
                  onClick={onUndo}
                  className="w-full"
                >
                  Undo Last Point
                </Button>
              )}
              {onCancel && (
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="w-full"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface RoomDetailsScreenProps {
  room: Room;
  onPathSelect?: (pathId: string) => void;
  onRoomDelete?: (roomId: string) => void;
  onPathDelete?: (pathId: string) => void;
  onPathCreateStart?: (sourceRoomId: string) => void;
}

function RoomDetailsScreen({
  room,
  onPathSelect,
  onRoomDelete,
  onPathDelete,
  onPathCreateStart,
}: RoomDetailsScreenProps) {
  const connectedPaths = getConnectedPaths(room);

  // Fetch user settings for step size adjustment in previews
  const { data: userSettings } = useQuery(
    trpc.userSettings.get.queryOptions()
  );

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
            {onPathCreateStart && (
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
                    <div className="flex items-center justify-between">
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
                          {(() => {
                            const anchorCount =
                              path.anchors?.length || 0;
                            const turns = Math.max(
                              0,
                              anchorCount - 2
                            );
                            return turns === 0
                              ? "no turns"
                              : `${turns} turn${
                                  turns === 1 ? "" : "s"
                                }`;
                          })()}
                        </Badge>
                        {onPathDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPathDelete(path.id);
                            }}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {path.instructionSet && (
                      <div className="space-y-1 mt-2">
                        <div className="text-xs text-gray-600">
                          <strong>Instructions:</strong>
                        </div>
                        <div className="text-xs">
                          {adjustInstructionText(
                            path.instructionSet
                              .descriptiveInstructions?.[0] ||
                              path.instructionSet
                                .conciseInstructions?.[0] ||
                              "",
                            userSettings?.stepSize
                          ) || "No instructions available"}
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
        <Card className="border-red-200 gap-0 py-3">
          <CardContent>
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
