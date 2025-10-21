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

  // Create a room
  createRoom: protectedProcedure
    .input(
      z.object({
        floorId: z.cuid(),
        name: z.string(),
        number: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        doorX: z.number().optional(),
        doorY: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.room.create({
        data: {
          floorId: input.floorId,
          name: input.name,
          number: input.number,
          x: input.x,
          y: input.y,
          width: input.width,
          height: input.height,
          doorX: input.doorX,
          doorY: input.doorY,
        },
        include: {
          floor: {
            include: {
              building: true,
            },
          },
        },
      });
    }),

  // Delete a room
  deleteRoom: protectedProcedure
    .input(z.object({ id: z.cuid() }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.room.delete({
          where: { id: input.id },
        });
      } catch (error: any) {
        if (error.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Room not found",
          });
        }
        throw error;
      }
    }),

  // Update room coordinates (for drawing)
  updateRoomCoordinates: publicProcedure
    .input(
      z.object({
        roomId: z.cuid(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        doorX: z.number().optional(),
        doorY: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.room.update({
          where: { id: input.roomId },
          data: {
            x: input.x,
            y: input.y,
            width: input.width,
            height: input.height,
            doorX: input.doorX,
            doorY: input.doorY,
          },
          include: {
            floor: {
              include: {
                building: true,
              },
            },
          },
        });
      } catch (error: any) {
        if (error.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Room not found",
          });
        }
        throw error;
      }
    }),

  // Update room name
  updateRoomName: publicProcedure
    .input(
      z.object({
        roomId: z.cuid(),
        name: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prisma.room.update({
          where: { id: input.roomId },
          data: {
            name: input.name,
          },
          include: {
            floor: {
              include: {
                building: true,
              },
            },
          },
        });
      } catch (error: any) {
        if (error.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Room not found",
          });
        }
        throw error;
      }
    }),

  // Create a path between two rooms
  createPath: protectedProcedure
    .input(
      z.object({
        fromRoomId: z.cuid(),
        toRoomId: z.cuid(),
        anchors: z.array(
          z.object({
            x: z.number(),
            y: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.$transaction(async (tx) => {
        // Create the path
        const path = await tx.path.create({
          data: {
            fromRoomId: input.fromRoomId,
            toRoomId: input.toRoomId,
          },
        });

        // Create path anchors
        let index = 0;
        for (const anchor of input.anchors) {
          await tx.pathAnchor.create({
            data: {
              pathId: path.id,
              index: index++,
              xCoords: anchor.x,
              yCoords: anchor.y,
            },
          });
        }

        return path;
      });
    }),

  // Delete a path
  deletePath: protectedProcedure
    .input(z.object({ pathId: z.cuid() }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.path.delete({
          where: { id: input.pathId },
        });
      } catch (error: any) {
        if (error.code === "P2025") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Path not found",
          });
        }
        throw error;
      }
    }),

  // Get all paths and rooms in a floor with data for DrawingCanvas
  getFloorData: publicProcedure
    .input(z.object({ floorId: z.cuid() }))
    .query(async ({ input }) => {
      const floor = await prisma.floor.findUnique({
        where: { id: input.floorId },
        include: {
          rooms: {
            orderBy: { name: "asc" },
            include: {
              fromPaths: {
                include: {
                  anchors: {
                    orderBy: { index: "asc" },
                  },
                  instructionSet: true,
                  toRoom: true,
                  fromRoom: true,
                },
              },
              toPaths: {
                include: {
                  anchors: {
                    orderBy: { index: "asc" },
                  },
                  instructionSet: true,
                  fromRoom: true,
                  toRoom: true,
                },
              },
            },
          },
          building: true,
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

  // Save floor, rooms, and paths at once
  saveFloor: protectedProcedure
    .input(
      z.object({
        floorId: z.cuid(),
        level: z.number().optional(),
        rooms: z.array(
          z.object({
            name: z.string(),
            number: z.string(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            doorX: z.number(),
            doorY: z.number(),
          })
        ),
        paths: z.array(
          z.object({
            fromRoomIndex: z.number(), // Index in the rooms array instead of ID
            toRoomIndex: z.number(), // Index in the rooms array instead of ID
            anchors: z.array(
              z.object({
                index: z.number(),
                xCoords: z.number(),
                yCoords: z.number(),
              })
            ),
            instructionSet: z
              .object({
                descriptiveInstructions: z.array(z.string()),
                conciseInstructions: z.array(z.string()),
              })
              .optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.$transaction(async (tx) => {
        // Update floor if level provided
        if (input.level !== undefined) {
          await tx.floor.update({
            where: { id: input.floorId },
            data: { level: input.level },
          });
        }

        // Delete all existing rooms for this floor
        await tx.room.deleteMany({
          where: { floorId: input.floorId },
        });

        // Delete all existing paths for this floor (this will cascade to anchors and instruction sets)
        await tx.path.deleteMany({
          where: {
            fromRoom: {
              floorId: input.floorId,
            },
          },
        });

        // Create new rooms
        const createdRooms = [];
        for (const roomData of input.rooms) {
          const newRoom = await tx.room.create({
            data: {
              name: roomData.name,
              number: roomData.number,
              x: roomData.x,
              y: roomData.y,
              width: roomData.width,
              height: roomData.height,
              doorX: roomData.doorX,
              doorY: roomData.doorY,
              floorId: input.floorId,
            },
          });
          createdRooms.push(newRoom);
        }

        // Create new paths with anchors and instruction sets
        for (const pathData of input.paths) {
          // Use room indices to get the actual room IDs
          const fromRoom = createdRooms[pathData.fromRoomIndex];
          const toRoom = createdRooms[pathData.toRoomIndex];

          if (!fromRoom || !toRoom) {
            console.warn(
              `Invalid room indices for path: ${pathData.fromRoomIndex} -> ${pathData.toRoomIndex}`
            );
            continue;
          }

          const newPath = await tx.path.create({
            data: {
              fromRoomId: fromRoom.id,
              toRoomId: toRoom.id,
            },
          });

          // Create anchors for this path
          for (const anchor of pathData.anchors) {
            await tx.pathAnchor.create({
              data: {
                index: anchor.index,
                xCoords: anchor.xCoords,
                yCoords: anchor.yCoords,
                pathId: newPath.id,
              },
            });
          }

          // Create instruction set if provided
          if (pathData.instructionSet) {
            await tx.instructionSet.create({
              data: {
                pathId: newPath.id,
                descriptiveInstructions:
                  pathData.instructionSet.descriptiveInstructions,
                conciseInstructions:
                  pathData.instructionSet.conciseInstructions,
              },
            });
          }
        }

        // Return updated floor data
        return await tx.floor.findUnique({
          where: { id: input.floorId },
          include: {
            rooms: {
              include: {
                fromPaths: {
                  include: {
                    anchors: {
                      orderBy: { index: "asc" },
                    },
                    instructionSet: true,
                    toRoom: true,
                  },
                },
                toPaths: {
                  include: {
                    anchors: {
                      orderBy: { index: "asc" },
                    },
                    instructionSet: true,
                    fromRoom: true,
                  },
                },
              },
            },
            building: true,
            _count: {
              select: { rooms: true },
            },
          },
        });
      });
    }),

  // Save generated instructions for a path
  saveInstructions: protectedProcedure
    .input(
      z.object({
        pathId: z.cuid(),
        descriptiveInstructions: z.array(z.string()),
        conciseInstructions: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      return await prisma.instructionSet.upsert({
        where: { pathId: input.pathId },
        update: {
          descriptiveInstructions: input.descriptiveInstructions,
          conciseInstructions: input.conciseInstructions,
        },
        create: {
          pathId: input.pathId,
          descriptiveInstructions: input.descriptiveInstructions,
          conciseInstructions: input.conciseInstructions,
        },
      });
    }),
});
