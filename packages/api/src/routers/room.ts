import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@sightmap/db";
import { publicProcedure, router } from "../index";

export const roomRouter = router({
  // Get a room by ID with its fromPaths
  getRoomById: publicProcedure
    .input(z.object({ roomId: z.cuid() }))
    .query(async ({ input }) => {
      const room = await prisma.room.findUnique({
        where: { id: input.roomId },
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
          floor: {
            include: {
              building: true,
            },
          },
        },
      });

      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }

      return room;
    }),

  // Get path instructions between two rooms
  getPathInstructions: publicProcedure
    .input(z.object({ fromRoomId: z.cuid(), toRoomId: z.cuid() }))
    .query(async ({ input }) => {
      const path = await prisma.path.findFirst({
        where: {
          fromRoomId: input.fromRoomId,
          toRoomId: input.toRoomId,
        },
        include: {
          anchors: {
            orderBy: { index: "asc" },
          },
          instructionSet: true,
          fromRoom: true,
          toRoom: true,
        },
      });

      if (!path) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Path not found between these rooms",
        });
      }

      return path;
    }),
});
