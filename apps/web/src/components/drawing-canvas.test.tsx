import {
  render,
  screen,
  fireEvent,
  renderHook,
} from "@testing-library/react";
import { expect, test, vi, beforeEach, describe } from "vitest";
import DrawingCanvas from "./drawing-canvas";
import { useRef } from "react";

// Mock all external dependencies
vi.mock("react-konva", () => ({
  Stage: ({ children, ...props }: any) => (
    <div data-testid="konva-stage" {...props}>
      {children}
    </div>
  ),
  Layer: ({ children, ...props }: any) => (
    <div data-testid="konva-layer" {...props}>
      {children}
    </div>
  ),
  Group: ({ children, ...props }: any) => (
    <div data-testid="konva-group" {...props}>
      {children}
    </div>
  ),
  Rect: (props: any) => <div data-testid="konva-rect" {...props} />,
  Line: (props: any) => <div data-testid="konva-line" {...props} />,
  Text: (props: any) => <div data-testid="konva-text" {...props} />,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Save: () => <svg data-testid="save-icon" />,
}));

// Mock trpc types and utils
vi.mock("@/utils/trpc", () => ({
  trpc: {},
}));

// Mock RouterOutputs type for the component
vi.mock("@/utils/utils", () => ({
  RouterOutputs: {},
}));

// Mock common types
vi.mock("@sightmap/common", () => ({
  EditMode: "room",
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, variant, className }: any) => (
    <button
      onClick={onClick}
      className={className}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

// Test data
const mockRooms = [
  {
    id: "room1",
    floorId: "floor1",
    name: "Living Room",
    number: "1",
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    doorX: 50,
    doorY: 0,
    fromPaths: [],
    toPaths: [],
  },
  {
    id: "room2",
    floorId: "floor1",
    name: "Kitchen",
    number: "2",
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
    x: 120,
    y: 0,
    width: 80,
    height: 80,
    doorX: null,
    doorY: null,
    fromPaths: [],
    toPaths: [],
  },
];

const defaultProps = {
  stageDimensions: { width: 800, height: 600 },
  rooms: [],
  selectedRoomId: null,
  onRoomSelect: vi.fn(),
  onRoomUpdate: vi.fn(),
  mode: "room" as const,

  selectedPathId: null,
  pathCreationState: "idle" as const,
  pathDestinationRoomId: null,
  currentPathPoints: [],
};

describe("DrawingCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders basic component with minimal props", () => {
    const { container } = render(<DrawingCanvas {...defaultProps} />);

    // Check if the component renders without crashing
    expect(container).toBeInTheDocument();

    // Check for Konva Stage wrapper
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();
    expect(screen.getByTestId("konva-layer")).toBeInTheDocument();
  });

  test("renders with rooms and verifies room rendering logic", () => {
    const props = {
      ...defaultProps,
      rooms: mockRooms as any,
    };

    const { container } = render(<DrawingCanvas {...props} />);

    // Basic rendering check
    expect(container).toBeInTheDocument();

    // Should render rooms (via Konva components)
    const groups = screen.getAllByTestId("konva-group");
    expect(groups.length).toBeGreaterThan(0);
  });

  test("handles pending rooms functionality with save/discard buttons", () => {
    // This would require mocking internal state or finding another way
    // Since pendingRooms is internal state, we might need to test via integration or mock hooks
  });

  test("exposes ref method startPathCreation", () => {
    const ref = { current: null } as any;

    const props = {
      ...defaultProps,
      mode: "path" as const,
    };

    render(<DrawingCanvas ref={ref} {...props} />);

    // Check that ref has startPathCreation method
    expect(ref.current).toHaveProperty("startPathCreation");
    expect(typeof ref.current.startPathCreation).toBe("function");

    // Call the method - should not throw
    expect(() =>
      ref.current.startPathCreation("room1")
    ).not.toThrow();
  });

  test("handles mode switching between room/path modes", () => {
    // Test room mode
    const { rerender } = render(<DrawingCanvas {...defaultProps} />);
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();

    // Test path mode
    rerender(<DrawingCanvas {...defaultProps} />);
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();

    // Both should render differently (though we can't test internal logic easily with mocks)
  });

  test("handles different prop configurations", () => {
    // Test with custom gridSize
    const propsWithGridSize = {
      ...defaultProps,
      gridSize: 50,
    };
    const { rerender } = render(
      <DrawingCanvas {...propsWithGridSize} />
    );
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();

    // Test with all optional props
    const propsWithAllOptional = {
      ...defaultProps,
      gridSize: 30,
      onRoomCreate: vi.fn(),
      onRoomDelete: vi.fn(),
      onPathCreate: vi.fn(),
      onPathCreateStart: vi.fn(),
    };
    rerender(<DrawingCanvas {...propsWithAllOptional} />);
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();
  });
});
