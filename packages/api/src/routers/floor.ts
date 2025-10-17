import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@sightmap/db";
import {
  publicProcedure,
  protectedProcedure,
  router,
} from "../index";

export const floorRouter = router({
  // Get a single floor by id
  getById: publicProcedure
    .input(z.object({ id: z.cuid() }))
    .query(async ({ input }) => {
      const floor = await prisma.floor.findUnique({
        where: { id: input.id },
        include: {
          building: true,
          rooms: {
            include: {
              fromPaths: {
                include: {
                  anchors: true,
                  instructionSet: true,
                  toRoom: true,
                },
              },
              toPaths: {
                include: {
                  anchors: true,
                  instructionSet: true,
                  fromRoom: true,
                },
              },
            },
          },
          _count: {
            select: { rooms: true },
          },
        },
      });
      if (!floor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Floor not found",
        });
      }
      return floor;
    }),

  // Create a floor
  create: protectedProcedure
    .input(
      z.object({
        buildingId: z.cuid(),
        level: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await prisma.floor.create({
        data: {
          level: input.level,
          buildingId: input.buildingId,
          createdById: ctx.session.user.id,
        },
        include: {
          building: true,
        },
      });
    }),

  // Delete a floor
  delete: publicProcedure
    .input(z.object({ id: z.cuid() }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.floor.delete({
          where: { id: input.id },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Floor not found",
        });
      }
    }),

  // Update room coordinates (for drawing)
  updateRoomCoordinates: publicProcedure
    .input(
      z.object({
        id: z.cuid(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.room.update({
          where: { id: input.id },
          data: {
            x: input.x,
            y: input.y,
            width: input.width,
            height: input.height,
          },
          include: {
            floor: {
              include: {
                building: true,
              },
            },
          },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
    }),
});
