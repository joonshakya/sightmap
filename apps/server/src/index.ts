import "dotenv/config";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@sightmap/api/context";
import { appRouter } from "@sightmap/api/routers/index";
import { auth } from "@sightmap/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { generateInstructions } from "./instructionGeneration";

const app = new Hono();

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
