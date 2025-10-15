import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@sightmap/db";
import {
  publicProcedure,
  protectedProcedure,
  router,
} from "../index";

export const buildingRouter = router({
  // Get all buildings with their floors
  getAll: publicProcedure.query(async () => {
    return await prisma.building.findMany({
      include: { floors: true },
      orderBy: { createdAt: "desc" },
    });
  }),

  // Get a single building by id
  getById: publicProcedure
    .input(z.object({ id: z.cuid() }))
    .query(async ({ input }) => {
      const building = await prisma.building.findUnique({
        where: { id: input.id },
        include: { floors: true },
      });
      if (!building) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }
      return building;
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

  // Update a building
  update: publicProcedure
    .input(
      z.object({
        id: z.cuid(),
        name: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.building.update({
          where: { id: input.id },
          data: {
            name: input.name,
          },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Building not found",
        });
      }
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

  // Create a floor under a building
  createFloor: protectedProcedure
    .input(
      z.object({
        buildingId: z.cuid(),
        name: z.string().min(1),
        level: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await prisma.floor.create({
        data: {
          name: input.name,
          level: input.level,
          buildingId: input.buildingId,
          createdById: ctx.session.user.id,
        },
      });
    }),

  // Update a floor
  updateFloor: publicProcedure
    .input(
      z.object({
        id: z.cuid(),
        name: z.string().min(1),
        level: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.floor.update({
          where: { id: input.id },
          data: {
            name: input.name,
            level: input.level,
          },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Floor not found",
        });
      }
    }),

  // Delete a floor
  deleteFloor: publicProcedure
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

  // Get floor details with rooms, paths, and instructions
  getFloorDetails: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const floor = await prisma.floor.findUnique({
        where: { id: input.id },
        include: {
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

  // Update a room's coordinates (for drawing)
  updateRoomCoordinates: publicProcedure
    .input(
      z.object({
        id: z.string(),
        startXCoords: z.number(),
        startYCoords: z.number(),
        endXCoords: z.number(),
        endYCoords: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.room.update({
          where: { id: input.id },
          data: {
            startXCoords: input.startXCoords,
            startYCoords: input.startYCoords,
            endXCoords: input.endXCoords,
            endYCoords: input.endYCoords,
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
