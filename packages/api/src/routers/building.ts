import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@sightmap/db";
import { publicProcedure, router } from "../index";

export const buildingRouter = router({
  // Get all buildings with their floors
  getAll: publicProcedure.query(async () => {
    return await prisma.building.findMany({
      include: { floors: true },
      orderBy: { createdAt: "desc" },
    });
  }),

  // Create a building
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.building.create({
        data: {
          name: input.name,
        },
      });
    }),

  // Delete a building
  delete: publicProcedure
    .input(z.object({ id: z.cuid() }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.building.delete({
          where: { id: input.id },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }
    }),
});
