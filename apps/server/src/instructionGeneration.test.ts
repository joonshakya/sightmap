import { expect, test, vi, beforeEach, describe } from "vitest";
import {
  calculatePathSegments,
  calculateRelativeDirections,
  getDirection,
  directionToAngle,
  calculateTurnDirection,
  getPerpendicularDistance,
  type PathSegment,
} from "./instructionGeneration";
import type {
  PathAnchor,
  Room,
} from "@sightmap/common/prisma/client";

// Mock external dependencies
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: vi.fn(
        () => new Response("mock response")
      ),
    })),
  })),
}));

vi.mock("@sightmap/db", () => ({
  default: {
    path: {
      findUnique: vi.fn(),
    },
    room: {
      findMany: vi.fn(),
    },
  },
}));

describe("Instruction Generation Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDirection", () => {
    test('returns "right" for movement right', () => {
      const result = getDirection({ x: 0, y: 0 }, { x: 10, y: 0 });
      expect(result).toBe("right");
    });

    test('returns "left" for movement left', () => {
      const result = getDirection({ x: 10, y: 0 }, { x: 0, y: 0 });
      expect(result).toBe("left");
    });

    test('returns "backwards" for movement down (Y increases)', () => {
      const result = getDirection({ x: 0, y: 0 }, { x: 0, y: 10 });
      expect(result).toBe("backwards");
    });

    test('returns "forward" for movement up (Y decreases)', () => {
      const result = getDirection({ x: 0, y: 10 }, { x: 0, y: 0 });
      expect(result).toBe("forward");
    });
  });

  describe("directionToAngle", () => {
    test('converts "forward" to 0 degrees', () => {
      expect(directionToAngle("forward")).toBe(0);
    });

    test('converts "right" to 90 degrees', () => {
      expect(directionToAngle("right")).toBe(90);
    });

    test('converts "backwards" to 180 degrees', () => {
      expect(directionToAngle("backwards")).toBe(180);
    });

    test('converts "left" to 270 degrees', () => {
      expect(directionToAngle("left")).toBe(270);
    });
  });

  describe("calculateTurnDirection", () => {
    test("returns null for no turn needed", () => {
      expect(calculateTurnDirection(90, 90)).toBeNull();
    });

    test('returns "right" for turning right', () => {
      expect(calculateTurnDirection(0, 90)).toBe("right");
    });

    test('returns "left" for turning left', () => {
      expect(calculateTurnDirection(90, 180)).toBe("right");
      expect(calculateTurnDirection(0, 270)).toBe("left");
    });

    test("handles angle wrapping", () => {
      expect(calculateTurnDirection(270, 90)).toBe("right");
    });
  });

  describe("getPerpendicularDistance", () => {
    test("calculates distance from point to line", () => {
      const distance = getPerpendicularDistance(
        { x: 5, y: 5 }, // point
        { x: 0, y: 0 }, // line start
        { x: 10, y: 0 } // line end (horizontal line)
      );
      expect(distance).toBe(5);
    });

    test("returns distance to start point when closest", () => {
      const distance = getPerpendicularDistance(
        { x: -5, y: 5 },
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      );
      expect(distance).toBe(Math.sqrt(25 + 25)); // distance to (0,0)
    });
  });

  describe("calculatePathSegments", () => {
    test("calculates segments with steps and directions", () => {
      const anchors: PathAnchor[] = [
        {
          id: "1",
          pathId: "path1",
          index: 0,
          xCoords: 0,
          yCoords: 0,
        },
        {
          id: "2",
          pathId: "path1",
          index: 1,
          xCoords: 50,
          yCoords: 0,
        }, // 50 right
        {
          id: "3",
          pathId: "path1",
          index: 2,
          xCoords: 50,
          yCoords: 100,
        }, // 100 down
      ];

      const rooms: Room[] = [
        {
          id: "room1",
          name: "Classroom A",
          number: "101",
          floorId: "floor1",
          x: 40,
          y: 20,
          width: 20,
          height: 20,
          createdAt: new Date(),
          doorX: 0,
          doorY: 0,
          updatedAt: new Date(),
        } satisfies Room,
      ];

      const result = calculatePathSegments(anchors, rooms);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        direction: "right",
        steps: 3, // 50 / 20 = 2.5, rounded to 3
        nearbyRooms: ["Classroom A"], // room is near the horizontal segment
      });
      expect(result[1]).toEqual({
        direction: "backwards",
        steps: 5, // 100 / 20 = 5
        nearbyRooms: ["Classroom A"], // room is near second segment at (50,100)
      });
    });

    test("handles empty anchors array", () => {
      const result = calculatePathSegments([], []);
      expect(result).toEqual([]);
    });

    test("skips invalid anchors", () => {
      const anchors: PathAnchor[] = [
        {
          id: "1",
          pathId: "path1",
          index: 0,
          xCoords: 0,
          yCoords: 0,
        },
        // Missing second anchor
      ];

      const result = calculatePathSegments(anchors, []);
      expect(result).toEqual([]);
    });
  });

  describe("calculateRelativeDirections", () => {
    test("adds relative directions and facing info", () => {
      const segments: PathSegment[] = [
        { direction: "forward", steps: 5, nearbyRooms: [] },
        {
          direction: "right",
          steps: 3,
          nearbyRooms: ["Lab"],
        },
        { direction: "forward", steps: 2, nearbyRooms: [] },
      ];

      const result = calculateRelativeDirections(segments);

      expect(result).toHaveLength(3);

      // First segment - no turn
      expect(result[0]).toEqual({
        direction: "forward",
        steps: 5,
        nearbyRooms: [],
        relativeDirection: "Move forward",
        facingDirection: "forward",
      });

      // Second segment - turn right
      expect(result[1]).toEqual({
        direction: "right",
        steps: 3,
        nearbyRooms: ["Lab"],
        relativeDirection: "Turn right and move forward",
        facingDirection: "right",
      });

      // Third segment - continuing in forward direction
      expect(result[2]).toEqual({
        direction: "forward",
        steps: 2,
        nearbyRooms: [],
        relativeDirection: "Turn left and move forward", // since previous was right, continuing forward needs left turn
        facingDirection: "forward",
      });
    });

    test("handles empty segments array", () => {
      const result = calculateRelativeDirections([]);
      expect(result).toEqual([]);
    });

    test("handles turn left", () => {
      const segments: PathSegment[] = [
        { direction: "forward", steps: 1, nearbyRooms: [] },
        { direction: "left", steps: 2, nearbyRooms: [] },
      ];

      const result = calculateRelativeDirections(segments);

      expect(result[1]?.relativeDirection).toBe(
        "Turn left and move forward"
      );
    });
  });

  describe("Integration - calculatePathSegments and calculateRelativeDirections", () => {
    test("processes complete path from anchors to relative directions", () => {
      const anchors: PathAnchor[] = [
        {
          id: "1",
          pathId: "path1",
          index: 0,
          xCoords: 0,
          yCoords: 0,
        },
        {
          id: "2",
          pathId: "path1",
          index: 1,
          xCoords: 100,
          yCoords: 0,
        }, // move right 100
        {
          id: "3",
          pathId: "path1",
          index: 2,
          xCoords: 100,
          yCoords: 150,
        }, // move down 150
      ];

      const rooms: Room[] = [];

      const pathSegments = calculatePathSegments(anchors, rooms);
      const relativeSegments =
        calculateRelativeDirections(pathSegments);

      expect(relativeSegments).toHaveLength(2);
      expect(relativeSegments[0]?.relativeDirection).toBe(
        "Move forward"
      );
      expect(relativeSegments[0]?.steps).toBe(5); // 100 / 20 = 5

      expect(relativeSegments[1]?.relativeDirection).toBe(
        "Turn right and move forward"
      );
      expect(relativeSegments[1]?.steps).toBe(8); // 150 / 20 = 7.5, rounded to 8
    });

    test("includes nearby rooms information in output", () => {
      const anchors: PathAnchor[] = [
        {
          id: "1",
          pathId: "path1",
          index: 0,
          xCoords: 100,
          yCoords: 100,
        },
        {
          id: "2",
          pathId: "path1",
          index: 1,
          xCoords: 200,
          yCoords: 100,
        },
      ];

      const rooms: Room[] = [
        {
          id: "room1",
          name: "Library",
          number: "200",
          floorId: "floor1",
          x: 150,
          y: 80,
          width: 40,
          height: 40,
          createdAt: new Date(),
          doorX: 0,
          doorY: 0,
          updatedAt: new Date(),
        } satisfies Room,
      ];

      const pathSegments = calculatePathSegments(anchors, rooms);
      const relativeSegments =
        calculateRelativeDirections(pathSegments);

      expect(relativeSegments).toHaveLength(1);
      expect(relativeSegments[0]?.nearbyRooms).toContain("Library");
    });
  });
});
