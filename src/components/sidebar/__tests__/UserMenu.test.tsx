import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AuthUser } from "@/lib/types";

const useAuthMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

// Avoid pulling in next-auth/react redirect helpers in jsdom.
const signOutUser = vi.fn();
vi.mock("@/api/auth", () => ({
  signInGoogle: vi.fn(),
  signInDev: vi.fn(),
  signOutUser: () => signOutUser(),
}));

// Part C v2: UserMenu reads the Claude account-auth status via react-query, and
// (when opened) renders AuthorizeClaudeModal which uses the login mutations.
// Mock the whole hook module so the component renders without a
// QueryClientProvider.
const useClaudeAuthMock = vi.fn();
vi.mock("@/hooks/useClaudeAuth", () => ({
  useClaudeAuth: () => useClaudeAuthMock(),
  useStartClaudeLogin: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSubmitClaudeCode: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useClaudeLogout: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

import { UserMenu } from "../UserMenu";

describe("UserMenu", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    signOutUser.mockReset();
    useClaudeAuthMock.mockReset();
    useClaudeAuthMock.mockReturnValue({ data: undefined });
  });

  it("logged-out: shows Google login and the dev login button", () => {
    useAuthMock.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refetch: vi.fn(),
    });

    render(<UserMenu />);
    expect(screen.getByText("Log in with Google")).toBeInTheDocument();
    expect(screen.getByText("Sign in as Test User")).toBeInTheDocument();
  });

  it("logged-in: shows the user name and a logout control in the popover", () => {
    const user: AuthUser = {
      id: "u1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    };
    useAuthMock.mockReturnValue({
      user,
      isLoading: false,
      isAuthenticated: true,
      refetch: vi.fn(),
    });

    render(<UserMenu />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // No Google login when authenticated.
    expect(screen.queryByText("Log in with Google")).not.toBeInTheDocument();

    // Logout lives in a popover that opens on the account button.
    expect(screen.queryByText("Log out")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const logout = screen.getByText("Log out");
    expect(logout).toBeInTheDocument();
    fireEvent.click(logout);
    expect(signOutUser).toHaveBeenCalledTimes(1);
  });

  it("logged-in: the popover includes an Authorize Claude entry (Part C v2)", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", name: "Ada", email: "ada@example.com", image: null },
      isLoading: false,
      isAuthenticated: true,
      refetch: vi.fn(),
    });

    render(<UserMenu />);
    // Hidden until the account popover is opened.
    expect(screen.queryByText("Authorize Claude")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("Authorize Claude")).toBeInTheDocument();
  });
});
