import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { toast } from "sonner";
import type { RouterOutputs } from "@/utils/trpc";

type Room = RouterOutputs["floor"]["getFloorData"]["rooms"][number];
type Path = Room["fromPaths"][number];

interface BulkGenerationProgress {
  totalPaths: number;
  completedPaths: number;
  failedPaths: number;
  currentBatch: number;
  totalBatches: number;
  pathStatuses: Record<
    string,
    "pending" | "generating" | "completed" | "failed"
  >;
  pathProgress: Record<
    string,
    {
      descriptiveSteps: number;
      conciseInstructions: number;
      totalSegments: number;
    }
  >;
}

interface UseBulkInstructionGenerationProps {
  floorId: string;
  onProgress?: (progress: BulkGenerationProgress) => void;
  onComplete?: (
    results: { pathId: string; success: boolean }[]
  ) => void;
}

export function useBulkInstructionGeneration({
  floorId,
  onProgress,
  onComplete,
}: UseBulkInstructionGenerationProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<BulkGenerationProgress>({
    totalPaths: 0,
    completedPaths: 0,
    failedPaths: 0,
    currentBatch: 0,
    totalBatches: 0,
    pathStatuses: {},
    pathProgress: {},
  });

  const queryClient = useQueryClient();

  const saveInstructionsMutation = useMutation(
    trpc.floor.saveInstructions.mutationOptions({
      onSuccess(data, variables, onMutateResult, context) {
        context.client.invalidateQueries({
          queryKey: trpc.floor.getFloorData.queryKey({ floorId }),
        });
      },
      onError: (error) => {
        toast.error("Failed to save instructions: " + error.message);
      },
    })
  );

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

  const generateInstructionsForPath = useCallback(
    async (
      path: Path,
      onStreamProgress?: (
        pathId: string,
        progress: {
          descriptiveSteps: number;
          conciseInstructions: number;
          totalSegments: number;
        }
      ) => void
    ): Promise<boolean> => {
      try {
        // Make direct API call to generate instructions
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/generate-instructions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: JSON.stringify({ pathId: path.id }),
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        let completion = "";
        const decoder = new TextDecoder();
        let buffer = "";
        const totalSegments = Math.max(
          0,
          (path.anchors?.length || 0) - 1
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6); // Remove "data: " prefix
              if (data === "[DONE]") {
                // End of stream
                break;
              }
              try {
                const parsed = JSON.parse(data);
                // Extract text content from different possible fields
                if (parsed.text) {
                  completion += parsed.text;
                } else if (parsed.content) {
                  completion += parsed.content;
                } else if (
                  parsed.type === "text-delta" &&
                  parsed.delta
                ) {
                  completion += parsed.delta;
                } else if (parsed.delta && parsed.delta.text) {
                  completion += parsed.delta.text;
                } else if (
                  parsed.choices &&
                  parsed.choices[0] &&
                  parsed.choices[0].text
                ) {
                  completion += parsed.choices[0].text;
                } else if (
                  parsed.choices &&
                  parsed.choices[0] &&
                  parsed.choices[0].delta &&
                  parsed.choices[0].delta.content
                ) {
                  completion += parsed.choices[0].delta.content;
                }
                // Log unknown event types for debugging
                // else if (
                //   parsed.type &&
                //   ![
                //     "text-end",
                //     "finish-step",
                //     "finish",
                //     "text-delta",
                //   ].includes(parsed.type)
                // ) {
                //   console.log("Unknown event type:", parsed);
                // }

                // Update progress on each chunk
                if (onStreamProgress) {
                  const parsedData =
                    parseCompletionContent(completion);
                  onStreamProgress(path.id, {
                    descriptiveSteps: parsedData.steps.length,
                    conciseInstructions:
                      parsedData.conciseInstructions.length,
                    totalSegments,
                  });
                }
              } catch (e) {
                // Ignore invalid JSON
              }
            }
          }
        }

        const parsedData = parseCompletionContent(completion);

        if (parsedData.steps.length > 0) {
          // Save instructions
          await saveInstructionsMutation.mutateAsync({
            pathId: path.id,
            descriptiveInstructions: parsedData.steps,
            conciseInstructions: parsedData.conciseInstructions || [],
          });
          return true;
        } else {
          console.error(
            `No instructions generated for path ${path.id}`
          );
          return false;
        }
      } catch (error) {
        console.error(
          `Error generating instructions for path ${path.id}:`,
          error
        );
        return false;
      }
    },
    [saveInstructionsMutation]
  );

  const generateBulkInstructions = useCallback(
    async (paths: Path[]) => {
      if (paths.length === 0) return;

      setIsGenerating(true);

      // Initialize progress
      const initialProgress: BulkGenerationProgress = {
        totalPaths: paths.length,
        completedPaths: 0,
        failedPaths: 0,
        currentBatch: 0,
        totalBatches: Math.ceil(paths.length / 10),
        pathStatuses: paths.reduce((acc, path) => {
          acc[path.id] = "pending";
          return acc;
        }, {} as Record<string, "pending" | "generating" | "completed" | "failed">),
        pathProgress: {},
      };

      setProgress(initialProgress);
      onProgress?.(initialProgress);

      const results: { pathId: string; success: boolean }[] = [];
      const batchSize = 10;

      // Process paths in batches of 10
      for (
        let batchIndex = 0;
        batchIndex < initialProgress.totalBatches;
        batchIndex++
      ) {
        const batchStart = batchIndex * batchSize;
        const batchEnd = Math.min(
          batchStart + batchSize,
          paths.length
        );
        const batch = paths.slice(batchStart, batchEnd);

        // Update batch progress
        const batchProgress = {
          ...initialProgress,
          currentBatch: batchIndex + 1,
          pathStatuses: {
            ...initialProgress.pathStatuses,
            ...batch.reduce((acc, path) => {
              acc[path.id] = "generating";
              return acc;
            }, {} as Record<string, "generating">),
          },
        };

        setProgress(batchProgress);
        onProgress?.(batchProgress);

        // Process batch concurrently
        const batchPromises = batch.map(async (path) => {
          const success = await generateInstructionsForPath(
            path,
            (pathId, streamProgress) => {
              // Update streaming progress
              setProgress((currentProgress) => {
                const updatedProgress = {
                  ...currentProgress,
                  pathProgress: {
                    ...currentProgress.pathProgress,
                    [pathId]: streamProgress,
                  },
                };
                onProgress?.(updatedProgress);
                return updatedProgress;
              });
            }
          );
          results.push({ pathId: path.id, success });

          // Update individual path status
          const updatedStatuses: Record<
            string,
            "pending" | "generating" | "completed" | "failed"
          > = {
            ...batchProgress.pathStatuses,
            [path.id]: success ? "completed" : "failed",
          };

          const updatedProgress: BulkGenerationProgress = {
            ...batchProgress,
            completedPaths:
              batchProgress.completedPaths + (success ? 1 : 0),
            failedPaths:
              batchProgress.failedPaths + (success ? 0 : 1),
            pathStatuses: updatedStatuses,
          };

          setProgress(updatedProgress);
          onProgress?.(updatedProgress);

          return success;
        });

        // Wait for all paths in this batch to complete
        await Promise.all(batchPromises);
      }

      setIsGenerating(false);
      onComplete?.(results);

      const finalResults = results.filter((r) => r.success).length;
      toast.success(
        `Bulk generation complete! ${finalResults}/${paths.length} paths generated successfully.`
      );
    },
    [generateInstructionsForPath, onProgress, onComplete]
  );

  return {
    isGenerating,
    progress,
    generateBulkInstructions,
  };
}
