import { router } from "../index";
import { todoRouter } from "./todo";
import { buildingRouter } from "./building";
import { floorRouter } from "./floor";
import { userSettingsRouter } from "./userSettings";
import { roomRouter } from "./room";
import { floorImageRouter } from "./floorImage";
import type {
  inferRouterInputs,
  inferRouterOutputs,
} from "@trpc/server";

export const appRouter = router({
  todo: todoRouter,
  building: buildingRouter,
  floor: floorRouter,
  userSettings: userSettingsRouter,
  room: roomRouter,
  floorImage: floorImageRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
