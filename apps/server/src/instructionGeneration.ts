import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import prisma from "@sightmap/db";
import type {
  PathAnchor,
  Room,
} from "@sightmap/common/prisma/client";

// Types
export interface PathSegment {
  direction: "forward" | "left" | "right" | "backwards";
  steps: number;
  nearbyRooms: string[];
  relativeDirection?: string;
  facingDirection?: "forward" | "left" | "right" | "backwards";
}

// Helper functions
export function getDirection(
  from: { x: number; y: number },
  to: { x: number; y: number }
): "forward" | "backwards" | "left" | "right" {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  } else {
    return dy < 0 ? "forward" : "backwards";
  }
}

// Convert direction to angle in degrees (0 = forward, 90 = right, 180 = backwards, 270 = left)
export function directionToAngle(
  direction: "forward" | "backwards" | "left" | "right"
): number {
  switch (direction) {
    case "forward":
      return 0;
    case "right":
      return 90;
    case "backwards":
      return 180;
    case "left":
      return 270;
    default:
      return 0;
  }
}

// Calculate turn direction from current facing to target direction
export function calculateTurnDirection(
  currentFacing: number,
  targetDirection: number
): "left" | "right" | null {
  let angleDiff = (targetDirection - currentFacing + 360) % 360;

  if (angleDiff === 0) return null; // no turn needed
  if (angleDiff <= 180) return "right";
  return "left";
}

export function getPerpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  if (lenSq === 0) return Math.sqrt(A * A + B * B);

  const param = dot / lenSq;

  let xx, yy;
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  return Math.sqrt((point.x - xx) ** 2 + (point.y - yy) ** 2);
}

export function calculatePathSegments(
  anchors: PathAnchor[],
  allRooms: Room[]
): PathSegment[] {
  const segments: PathSegment[] = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    const from = anchors[i];
    const to = anchors[i + 1];

    if (!from || !to) continue;

    const distance = Math.sqrt(
      Math.pow(to.xCoords - from.xCoords, 2) +
        Math.pow(to.yCoords - from.yCoords, 2)
    );

    const steps = Math.round(distance / 20); // 20px = 1 medium step
    const direction = getDirection(
      { x: from.xCoords, y: from.yCoords },
      { x: to.xCoords, y: to.yCoords }
    );

    // Find nearby rooms within 100px (5 steps) perpendicular distance
    const nearbyRooms = allRooms
      .filter((room) => {
        const roomCenter = {
          x: room.x + room.width / 2,
          y: room.y + room.height / 2,
        };

        const distance = getPerpendicularDistance(
          roomCenter,
          { x: from.xCoords, y: from.yCoords },
          { x: to.xCoords, y: to.yCoords }
        );

        return distance <= 100; // 5 steps * 20px/step
      })
      .map((room) => room.name);

    segments.push({ direction, steps, nearbyRooms });
  }

  return segments;
}

// Calculate relative directions based on path progression
export function calculateRelativeDirections(
  segments: PathSegment[]
): PathSegment[] {
  if (segments.length === 0) return segments;

  const firstSegment = segments[0];
  if (!firstSegment) return segments;

  let currentFacingAngle = directionToAngle(firstSegment.direction);

  return segments.map((segment, index) => {
    const segmentAngle = directionToAngle(segment.direction);
    const turnDirection = calculateTurnDirection(
      currentFacingAngle,
      segmentAngle
    );

    let relativeDirection: string;
    if (index === 0) {
      // First segment - no turn needed, just move forward
      relativeDirection = `Move forward`;
    } else {
      // Subsequent segments - include turn if needed
      if (turnDirection) {
        relativeDirection = `Turn ${turnDirection} and move forward`;
      } else {
        relativeDirection = `Move forward`;
      }
    }

    // Update current facing direction for next segment
    currentFacingAngle = segmentAngle;

    return {
      ...segment,
      relativeDirection,
      facingDirection: segment.direction,
    };
  });
}

export async function generateInstructions(pathId: string) {
  try {
    // Fetch path data with rooms and anchors
    const path = await prisma.path.findUnique({
      where: { id: pathId },
      include: {
        fromRoom: true,
        toRoom: true,
        anchors: {
          orderBy: { index: "asc" },
        },
      },
    });

    if (!path) {
      throw new Error("Path not found");
    }

    // Get all rooms on the floor for spatial context
    const allRooms = await prisma.room.findMany({
      where: { floorId: path.fromRoom.floorId },
    });

    // Calculate path segments with directions and nearby rooms
    const pathSegments = calculatePathSegments(
      path.anchors,
      allRooms
    );

    // Calculate relative directions for better navigation
    const relativeSegments =
      calculateRelativeDirections(pathSegments);

    // Generate concise instructions (movement segments)
    const conciseInstructions = relativeSegments.map(
      (segment, index) =>
        `${index + 1}. ${segment.relativeDirection} {{${
          segment.steps
        }}} steps`
    );

    // Generate streaming instruction data with delimiters
    const prompt = `Generate navigation instructions for a visually impaired person.

PATH INFORMATION:
From: ${path.fromRoom.name} (${path.fromRoom.number})
To: ${path.toRoom.name} (${path.toRoom.number})

MOVEMENT SEGMENTS:
${relativeSegments
  .map(
    (segment, index) =>
      `${index + 1}. ${segment.relativeDirection} {{${
        segment.steps
      }}} steps${
        segment.nearbyRooms.length > 0
          ? ` (near ${segment.nearbyRooms.join(", ")})`
          : ""
      }`
  )
  .join("\n")}

Be creative with your sentence structure and wording. Use varied, natural language instead of repeating the same phrases. Make the instructions engaging and easy to follow.

IMPORTANT: Use {{step_number}} format for ALL step counts in your response.

Return response using these exact delimiters and also respond things after STEPS_END as it is:
SSTART
STEP: [step 1: full sentence using {{step_number}} format, e.g., "Walk forward {{8}} steps"]
STEP: [step 2: full sentence using {{step_number}} format, e.g., "Turn right and walk forward {{27}} steps"]
STEP: [step 3: full sentence using {{step_number}} format, e.g., "Move backward {{4}} steps to reach your destination"]
SEND
C:
${conciseInstructions.join("\n")}
EC
`;

    console.log(prompt);

    const result = streamText({
      model: google("gemma-3-27b-it"),
      prompt: prompt,
    });

    // return new Response("Hello");
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error generating instructions:", error);
    throw error;
  }
}
