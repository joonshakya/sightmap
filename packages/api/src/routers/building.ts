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

  // Get a single building by id
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
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
        address: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.building.create({
        data: {
          name: input.name,
          address: input.address,
        },
      });
    }),

  // Update a building
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.building.update({
          where: { id: input.id },
          data: {
            name: input.name,
            address: input.address,
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
    .input(z.object({ id: z.string().uuid() }))
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
  createFloor: publicProcedure
    .input(
      z.object({
        buildingId: z.string().uuid(),
        name: z.string().min(1),
        level: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.floor.create({
        data: {
          name: input.name,
          level: input.level,
          buildingId: input.buildingId,
        },
      });
    }),

  // Update a floor
  updateFloor: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
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
    .input(z.object({ id: z.string().uuid() }))
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
});
