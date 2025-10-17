import { router } from "../index";
import { todoRouter } from "./todo";
import { buildingRouter } from "./building";
import { floorRouter } from "./floor";
import { userSettingsRouter } from "./userSettings";

export const appRouter = router({
  todo: todoRouter,
  building: buildingRouter,
  floor: floorRouter,
  userSettings: userSettingsRouter,
});
export type AppRouter = typeof appRouter;
