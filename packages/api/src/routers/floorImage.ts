import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@sightmap/db";
import {
  publicProcedure,
  protectedProcedure,
  router,
} from "../index";

export const floorImageRouter = router({
  // Get all images for a floor
  getFloorImages: publicProcedure
    .input(z.object({ floorId: z.string() }))
    .query(async ({ input }) => {
      const images = await prisma.floorImage.findMany({
        where: { floorId: input.floorId },
        orderBy: { zIndex: "asc" },
      });
      return images;
    }),

  // Create a new floor image
  createFloorImage: protectedProcedure
    .input(
      z.object({
        floorId: z.string(),
        imageUrl: z.string(),
        x: z.number().default(0),
        y: z.number().default(0),
        scale: z.number().default(1.0),
        opacity: z.number().default(0.5),
        zIndex: z.number().default(0),
      }),
    )
    .mutation(async ({ input }) => {
      return await prisma.floorImage.create({
        data: {
          floorId: input.floorId,
          imageUrl: input.imageUrl,
          x: input.x,
          y: input.y,
          scale: input.scale,
          opacity: input.opacity,
          zIndex: input.zIndex,
        },
      });
    }),

  // Update image properties (position, scale, opacity, zIndex)
  updateFloorImage: publicProcedure
    .input(
      z.object({
        id: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        scale: z.number().optional(),
        opacity: z.number().optional(),
        zIndex: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      try {
        return await prisma.floorImage.update({
          where: { id },
          data,
        });
      } catch (error: any) {
        if (error.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Floor image not found",
          });
        }
        throw error;
      }
    }),

  // Delete a floor image
  deleteFloorImage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.floorImage.delete({
          where: { id: input.id },
        });
      } catch (error: any) {
        if (error.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Floor image not found",
          });
        }
        throw error;
      }
    }),
});
