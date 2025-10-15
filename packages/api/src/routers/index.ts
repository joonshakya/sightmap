import {
  protectedProcedure,
  publicProcedure,
  router,
} from "../index";
import { todoRouter } from "./todo";
import { buildingRouter } from "./building";
import { userSettingsRouter } from "./userSettings";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  todo: todoRouter,
  building: buildingRouter,
  userSettings: userSettingsRouter,
});
export type AppRouter = typeof appRouter;
