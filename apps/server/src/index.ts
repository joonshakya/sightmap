import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@sightmap/api/context";
import { appRouter } from "@sightmap/api/routers/index";
import { auth } from "@sightmap/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { generateInstructions } from "./instructionGeneration";
import path from "path";
import { existsSync, mkdirSync } from "fs";

const app = new Hono();

// Configure upload directory
const uploadDir = path.join(process.cwd(), "uploads", "floor-images");
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

app.use(logger());
app.use(
  "/*",
  cors({
    origin: [
      process.env.CORS_ORIGIN as string,
      "https://sightmap.joon.com.np",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "user-agent"],
    credentials: true,
  }),
);

// Serve static files from uploads directory
app.use(
  "/uploads/*",
  serveStatic({
    root: "./",
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) =>
  auth.handler(c.req.raw),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

// Image upload endpoint
app.post("/upload-floor-image", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Invalid file type" }, 400);
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json(
        { error: "File too large. Maximum size is 10MB" },
        400,
      );
    }

    // Save file
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${uniqueSuffix}-${file.name}`;
    const filepath = path.join(uploadDir, filename);

    const buffer = await file.arrayBuffer();
    await Bun.write(filepath, buffer);

    // Return relative URL
    const imageUrl = `/uploads/floor-images/${filename}`;
    return c.json({ imageUrl });
  } catch (error) {
    console.error("Error uploading file:", error);
    return c.json({ error: "Failed to upload file" }, 500);
  }
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
    return await generateInstructions(pathId);
  } catch (error) {
    console.error("Error generating instructions:", error);
    return c.json({ error: "Failed to generate instructions" }, 500);
  }
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
