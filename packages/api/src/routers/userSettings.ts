import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@sightmap/db";
import { protectedProcedure, router } from "../index";
import { StepSizeEnum } from "../../../db/prisma/generated/enums";

export const userSettingsRouter = router({
  // Get user settings (step size)
  get: protectedProcedure.query(async ({ ctx }) => {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: ctx.session.user.id },
    });
    if (!settings) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User settings not found",
      });
    }
    return settings;
  }),

  // Update step size
  updateStepSize: protectedProcedure
    .input(z.object({ stepSize: z.enum(StepSizeEnum) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await prisma.userSettings.upsert({
          where: { userId: ctx.session.user.id },
          update: { stepSize: input.stepSize },
          create: {
            userId: ctx.session.user.id,
            stepSize: input.stepSize,
          },
        });
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not update user settings",
        });
      }
    }),
});
