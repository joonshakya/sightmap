import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@sightmap/api/context";
import { appRouter } from "@sightmap/api/routers/index";
import { auth } from "@sightmap/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamText, convertToModelMessages } from "ai";
import { google } from "@ai-sdk/google";
import prisma from "@sightmap/db";

// Types
interface PathSegment {
  direction: "forward" | "backward" | "left" | "right";
  steps: number;
  nearbyRooms: string[];
  relativeDirection?: string;
}

interface PathAnchor {
  index: number;
  xCoords: number;
  yCoords: number;
}

// Helper functions
function getDirection(
  from: { x: number; y: number },
  to: { x: number; y: number }
): "forward" | "backward" | "left" | "right" {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Determine primary direction based on larger coordinate change
  // In canvas coordinates, y increases downward, so negative dy means "forward" (up)
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  } else {
    return dy < 0 ? "forward" : "backward"; // Negative dy = moving up = forward
  }
}

function getPerpendicularDistance(
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

function calculatePathSegments(
  anchors: PathAnchor[],
  allRooms: any[]
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
function calculateRelativeDirections(
  segments: PathSegment[]
): PathSegment[] {
  const directions = ["forward", "right", "backward", "left"];

  return segments.map((segment, index) => {
    if (index === 0) {
      // First segment - assume starting orientation, use absolute direction
      return { ...segment, relativeDirection: segment.direction };
    }

    const prevSegment = segments[index - 1];
    if (!prevSegment)
      return { ...segment, relativeDirection: segment.direction };

    const prevDirIndex = directions.indexOf(prevSegment.direction);
    const currentDirIndex = directions.indexOf(segment.direction);

    // Calculate the turn direction
    let turnDirection = "";
    if (prevDirIndex === currentDirIndex) {
      turnDirection = "continue " + segment.direction;
    } else {
      const turnAmount = (currentDirIndex - prevDirIndex + 4) % 4;
      if (turnAmount === 1)
        turnDirection = "turn right and " + segment.direction;
      else if (turnAmount === 3)
        turnDirection = "turn left and " + segment.direction;
      else if (turnAmount === 2)
        turnDirection = "turn around and " + segment.direction;
      else turnDirection = segment.direction; // same direction
    }

    return { ...segment, relativeDirection: turnDirection };
  });
}

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) =>
  auth.handler(c.req.raw)
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  })
);

app.post("/ai", async (c) => {
  const body = await c.req.json();
  const uiMessages = body.messages || [];
  const result = streamText({
    model: google("gemma-3-27b-it"),
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse();
});

app.post("/generate-instructions", async (c) => {
  const body = await c.req.json();

  // Handle useCompletion format - prompt wrapped in object
  let pathId: string;

  try {
    // useCompletion sends { prompt: "json string" }
    const promptString = body.prompt;
    const promptData = JSON.parse(promptString);
    pathId = promptData.pathId;
  } catch (e) {
    return c.json({ error: "Invalid request format" }, 400);
  }

  if (!pathId) {
    return c.json({ error: "pathId is required" }, 400);
  }

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
      return c.json({ error: "Path not found" }, 404);
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

IMPORTANT: Use {{step_number}} format for ALL step counts in your response.

Return response using these exact delimiters:
INSTRUCTION: [single line instruction referencing steps by plain numbers, e.g., "Follow steps 1, 2, and 3 to reach your destination"]
STEPS_START
STEP: [step 1: full sentence using {{step_number}} format, e.g., "Walk forward {{8}} steps"]
STEP: [step 2: full sentence using {{step_number}} format, e.g., "Turn right and walk forward {{27}} steps"]
STEP: [step 3: full sentence using {{step_number}} format, e.g., "Move backward {{4}} steps to reach your destination"]
STEPS_END`;

    const result = streamText({
      model: google("gemma-3-27b-it"),
      prompt: prompt,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error generating instructions:", error);
    return c.json({ error: "Failed to generate instructions" }, 500);
  }
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
