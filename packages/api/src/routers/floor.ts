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

  // Get all paths and rooms in a floor with data for DrawingCanvas
  getFloorData: publicProcedure
    .input(z.object({ floorId: z.cuid() }))
    .query(async ({ input }) => {
      const floor = await prisma.floor.findUnique({
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

      // Transform rooms into rectangles for DrawingCanvas
      const roomShapes = floor.rooms.map((room) => ({
        id: room.id,
        type: "rectangle" as const,
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        text: `${room.name} (${room.number})`,
        fill: "#ffffff",
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      }));

      // Transform paths into arrows for DrawingCanvas
      const pathShapes = floor.rooms.flatMap((room) =>
        room.fromPaths.map((path) => {
          // Create arrow from room door to first anchor or directly to destination
          const startX = room.doorX;
          const startY = room.doorY;

          let endX, endY;
          if (
            path.anchors &&
            path.anchors.length > 0 &&
            path.anchors[0]
          ) {
            // Use first anchor as end point for the arrow
            endX = path.anchors[0].xCoords;
            endY = path.anchors[0].yCoords;
          } else {
            // Direct connection to destination room door
            endX = path.toRoom.doorX;
            endY = path.toRoom.doorY;
          }

          return {
            id: path.id,
            type: "arrow" as const,
            points: [startX, startY, endX, endY],
            stroke: "#000000",
            isSnapped: false,
          };
        })
      );

      return {
        floor: {
          id: floor.id,
          level: floor.level,
          building: floor.building,
        },
        shapes: [...roomShapes, ...pathShapes],
        zoom: 1, // Default zoom
        rooms: floor.rooms,
        paths: floor.rooms.flatMap((room) => room.fromPaths),
      };
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
    .mutation(async ({ input, ctx }) => {
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
});
