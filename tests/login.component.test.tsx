import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetUser = jest.fn();
const mockRefresh = jest.fn();
const mockRefreshClubs = jest.fn();
const mockLogin = jest.fn();
const mockSetUserInfo = jest.fn();
const mockGetUserMessage = jest.fn((_error: unknown) => "ログインに失敗しました");

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/components/brand-logo", () => ({ BrandLogo: () => null }));
jest.mock("@/hooks/use-colors", () => ({
  useColors: () => ({ foreground: "#111", muted: "#666", border: "#ddd", surface: "#fff", background: "#fff", error: "#c00" }),
}));
jest.mock("@/lib/auth-context", () => ({ useAuthContext: () => ({ setUser: mockSetUser, refresh: mockRefresh }) }));
jest.mock("@/lib/club-store", () => ({ refreshClubs: (...args: unknown[]) => mockRefreshClubs(...args) }));
jest.mock("@/lib/_core/api", () => ({ login: (...args: unknown[]) => mockLogin(...args) }));
jest.mock("@/lib/_core/auth", () => ({
  setUserInfo: (...args: unknown[]) => mockSetUserInfo(...args),
  setSessionToken: jest.fn(),
  normalizeUserRole: (value: string) => value,
  normalizeAccessRole: (value: string) => value,
  normalizeBranchRole: (value: string) => value,
  normalizeBranchRoles: (value: string[]) => value,
}));
jest.mock("@/lib/_core/logger", () => ({
  getMembershipAccessMessage: () => null,
  logger: { error: jest.fn(), getUserMessage: (error: unknown) => mockGetUserMessage(error) },
}));

import LoginScreen from "@/app/login";

const user = {
  id: 7,
  openId: "member-7",
  name: "テスト会員",
  email: "member@example.test",
  loginMethod: "password",
  lastSignedIn: "2026-10-02T00:00:00.000Z",
  firstSignedIn: "2026-01-01T00:00:00.000Z",
  role: "user",
  accessRole: "member",
  branch: "kanto",
  branches: ["kanto"],
};

describe("login component integration", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockSetUserInfo.mockReset().mockResolvedValue(undefined);
    mockRefresh.mockReset().mockResolvedValue(undefined);
    mockRefreshClubs.mockReset().mockResolvedValue(undefined);
    mockReplace.mockClear();
    mockPush.mockClear();
    mockSetUser.mockClear();
    mockGetUserMessage.mockClear();
  });

  it("shows validation without calling the API when required fields are empty", () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByRole("button", { name: "ログイン" }));

    expect(screen.getByText("メールアドレスとパスワードを入力してください")).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("stores the authenticated user, refreshes authoritative data, and routes once", async () => {
    let resolveLogin!: (value: unknown) => void;
    mockLogin.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("example@email.com"), " member@example.test ");
    fireEvent.changeText(screen.getByPlaceholderText("パスワード"), "secret");

    fireEvent.press(screen.getByRole("button", { name: "ログイン" }));
    fireEvent(screen.getByPlaceholderText("パスワード"), "submitEditing");
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith("member@example.test", "secret");

    resolveLogin({ success: true, sessionToken: "session", user });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(tabs)"));
    expect(mockSetUserInfo).toHaveBeenCalledTimes(1);
    expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ id: 7, branch: "kanto" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshClubs).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("shows a safe user-facing error and permits a retry", async () => {
    mockLogin.mockRejectedValueOnce(new Error("network details")).mockResolvedValueOnce({ success: true, sessionToken: "session", user });
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("example@email.com"), "member@example.test");
    fireEvent.changeText(screen.getByPlaceholderText("パスワード"), "secret");

    fireEvent.press(screen.getByRole("button", { name: "ログイン" }));
    expect(await screen.findByText("ログインに失敗しました")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "ログイン" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledTimes(2);
  });
});
