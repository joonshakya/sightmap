import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/utils/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import StepSizeSelector from "@/components/step-size-selector";
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

export const Route = createFileRoute("/rooms/$fromRoomId/$toRoomId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { fromRoomId, toRoomId } = Route.useParams();
  const [stepSize, setStepSize] = useState<StepSize>("MEDIUM");

  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session;

  const pathData = useQuery(
    trpc.room.getPathInstructions.queryOptions({
      fromRoomId,
      toRoomId,
    })
  );

  // Fetch user settings if logged in
  const userSettingsData = useQuery(
    trpc.userSettings.get.queryOptions(undefined, {
      enabled: isLoggedIn,
    })
  );

  // Update step size mutation
  const updateStepSizeMutation = useMutation(
    trpc.userSettings.updateStepSize.mutationOptions()
  );

  // Set initial step size from backend if logged in
  useEffect(() => {
    if (isLoggedIn && userSettingsData.data) {
      setStepSize(userSettingsData.data.stepSize);
    }
  }, [isLoggedIn, userSettingsData.data]);

  // Handle step size change
  const handleStepSizeChange = (newStepSize: StepSize) => {
    setStepSize(newStepSize);
    if (isLoggedIn) {
      updateStepSizeMutation.mutate({ stepSize: newStepSize });
    }
  };

  if (pathData.isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (pathData.error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">
            Error
          </h2>
          <p className="text-gray-600">
            Failed to load path instructions
          </p>
        </div>
      </div>
    );
  }

  const path = pathData.data;

  // Apply step size adjustment to instructions
  const adjustedDescriptiveInstructions =
    path?.instructionSet?.descriptiveInstructions?.map(
      (instruction: string) =>
        adjustInstructionText(instruction, stepSize)
    ) || [];

  const adjustedConciseInstructions =
    path?.instructionSet?.conciseInstructions?.map(
      (instruction: string) =>
        adjustInstructionText(instruction, stepSize)
    ) || [];

  return (
    <div className="bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/rooms/$fromRoomId"
            params={{ fromRoomId }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to {path?.fromRoom.name}
          </Link>
        </div>

        {/* Route Info */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Navigation Instructions
          </h1>
          <p className="text-lg text-gray-600">
            From {path?.fromRoom.name} (Room {path?.fromRoom.number})
            to {path?.toRoom.name} (Room {path?.toRoom.number})
          </p>
        </div>

        {/* Step Size Selector */}
        <Card className="mb-6">
          <CardContent>
            <StepSizeSelector
              value={stepSize}
              onChange={handleStepSizeChange}
              className="justify-center"
            />
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardContent className="space-y-6">
            {/* Descriptive Instructions */}
            {adjustedDescriptiveInstructions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Step-by-Step Instructions
                </h3>
                <div className="space-y-3">
                  {adjustedDescriptiveInstructions.map(
                    (instruction: string, index: number) => (
                      <p
                        key={index}
                        className="flex gap-3 items-center"
                      >
                        <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </span>
                        <span className="text-gray-700 leading-relaxed">
                          {instruction}
                        </span>
                      </p>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Concise Instructions */}
            {adjustedConciseInstructions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Quick Reference
                </h3>
                <div className="space-y-3">
                  {adjustedConciseInstructions.map(
                    (instruction: string, index: number) => (
                      <div key={index} className="flex gap-3">
                        <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </span>
                        <p className="text-gray-700 leading-relaxed pt-1">
                          {instruction}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* No Instructions */}
            {adjustedDescriptiveInstructions.length === 0 &&
              adjustedConciseInstructions.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-600">
                    No instructions are available for this path yet.
                  </p>
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
