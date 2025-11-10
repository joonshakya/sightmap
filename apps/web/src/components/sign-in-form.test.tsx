import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignInForm from "./sign-in-form";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

// Mock external dependencies
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({
      isPending: false,
      data: null,
      error: null,
      refetch: vi.fn(),
    })),
    signIn: {
      email: vi.fn(),
    },
  },
}));

vi.mock("@/components/loader", () => ({
  default: () => <div data-testid="loader">Loading...</div>,
}));

describe("SignInForm", () => {
  const mockOnSwitchToSignUp = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form correctly", () => {
    render(<SignInForm onSwitchToSignUp={mockOnSwitchToSignUp} />);

    expect(screen.getByText("Welcome Back")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign In" })
    ).toBeInTheDocument();
  });

  it("shows validation errors for invalid input", async () => {
    const user = userEvent.setup();
    render(<SignInForm onSwitchToSignUp={mockOnSwitchToSignUp} />);

    const submitButton = screen.getByRole("button", {
      name: "Sign In",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email address")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Password must be at least 8 characters")
      ).toBeInTheDocument();
    });
  });

  it("calls signIn on valid submit and shows success toast", async () => {
    const user = userEvent.setup();
    const mockSignIn = vi.mocked(authClient.signIn.email);
    mockSignIn.mockImplementation(async (credentials, options) => {});

    render(<SignInForm onSwitchToSignUp={mockOnSwitchToSignUp} />);

    await user.type(
      screen.getByLabelText("Email"),
      "test@example.com"
    );
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith(
        { email: "test@example.com", password: "password123" },
        expect.any(Object)
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Sign in successful"
      );
    });
  });

  it("shows error toast on signIn failure", async () => {
    const user = userEvent.setup();
    const mockSignIn = vi.mocked(authClient.signIn.email);
    mockSignIn.mockImplementation(async (credentials, options) => {
      const betterFetchError = {
        status: 401,
        statusText: "Unauthorized",
        error: { message: "Invalid credentials" },
        name: "BetterFetchError",
        message: "Invalid credentials",
      };
      options?.onError?.(betterFetchError as any);
    });

    render(<SignInForm onSwitchToSignUp={mockOnSwitchToSignUp} />);

    await user.type(
      screen.getByLabelText("Email"),
      "test@example.com"
    );
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
    });
  });

  it("calls onSwitchToSignUp when link is clicked", async () => {
    const user = userEvent.setup();
    render(<SignInForm onSwitchToSignUp={mockOnSwitchToSignUp} />);

    const switchLink = screen.getByText("Need an account? Sign Up");
    await user.click(switchLink);

    expect(mockOnSwitchToSignUp).toHaveBeenCalledTimes(1);
  });

  it("shows loader when session is pending", () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: null,
      isPending: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<SignInForm onSwitchToSignUp={mockOnSwitchToSignUp} />);

    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });
});
