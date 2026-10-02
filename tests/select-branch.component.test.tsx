import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockSetUser = jest.fn();
const mockSetUserInfo = jest.fn(async () => undefined);
const mockSelectBranches = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
}));

jest.mock("@/hooks/use-colors", () => ({
  useColors: () => ({
    foreground: "#111",
    muted: "#666",
    primary: "#e8a0bf",
    border: "#ddd",
    surface: "#fff",
    error: "#c00",
  }),
}));

jest.mock("@/components/brand-logo", () => ({ BrandLogo: () => null }));
jest.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/components/ui/icon-symbol", () => ({ IconSymbol: () => null }));

jest.mock("@/lib/auth-context", () => ({
  useAuthContext: () => ({
    user: {
      id: 1,
      openId: "preview-user",
      name: "Preview Member",
      loginMethod: "preview",
      lastSignedIn: new Date(),
      role: "user",
      accessRole: "member",
      branch: null,
      branches: [],
    },
    setUser: mockSetUser,
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/_core/auth", () => {
  return {
    normalizeBranchRoles: (branches: unknown, fallback: unknown) => {
      if (Array.isArray(branches)) return branches.filter((branch) => branch === "kanto" || branch === "kansai");
      return fallback === "kanto" || fallback === "kansai" ? [fallback] : [];
    },
    setUserInfo: mockSetUserInfo,
  };
});

jest.mock("@/lib/_core/api", () => ({
  ApiError: class ApiError extends Error {},
  selectBranches: mockSelectBranches,
  submitBrowserLogout: jest.fn(() => false),
}));

jest.mock("@/lib/trpc", () => ({
  trpc: { auth: { selectBranches: { useMutation: () => ({ mutateAsync: jest.fn() }) } } },
}));

import SelectBranchScreen from "@/app/select-branch";

describe("select branch component integration", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSetUser.mockClear();
    mockSetUserInfo.mockClear();
    mockSelectBranches.mockClear();
  });

  it("requires at least one branch before continuing", () => {
    render(<SelectBranchScreen />);

    expect(screen.getByText("支部を1つ以上選択してください")).toBeTruthy();
    expect(screen.getByRole("button", { name: "選択した支部で始める" }).props.accessibilityState.disabled).toBe(true);
  });

  it("enables the continue action after a branch is selected", () => {
    render(<SelectBranchScreen />);

    fireEvent.press(screen.getByRole("checkbox", { name: "関東支部" }));
    expect(screen.queryByText("支部を1つ以上選択してください")).toBeNull();
    const continueButton = screen.getByRole("button", { name: "選択した支部で始める" });
    expect(continueButton.props.accessibilityState.disabled).toBe(false);
  });
});
