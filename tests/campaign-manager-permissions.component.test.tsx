import React from "react";
import { render, screen } from "@testing-library/react-native";

let mockUser = { role: "user", accessRole: "member" };

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/components/ui/icon-symbol", () => ({ IconSymbol: () => null }));
jest.mock("@/hooks/use-colors", () => ({
  useColors: () => ({ foreground: "#111", muted: "#666", border: "#ddd", surface: "#fff", background: "#fff" }),
}));
jest.mock("@/lib/auth-context", () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock("@/lib/campaign-store", () => ({
  useCampaigns: () => [],
  createCampaign: jest.fn(),
  deleteCampaign: jest.fn(),
  setCampaignStatus: jest.fn(),
  updateCampaign: jest.fn(),
}));

import CampaignManagerScreen from "@/app/campaign-manager";

describe("campaign manager permission integration", () => {
  it("denies an ordinary member", () => {
    mockUser = { role: "user", accessRole: "member" };
    render(<CampaignManagerScreen />);

    expect(screen.getByText("運営メンバーのみアクセスできます")).toBeTruthy();
    expect(screen.queryByText("キャンペーン管理")).toBeNull();
  });

  it.each([
    { role: "operator", accessRole: "operator" },
    { role: "admin", accessRole: "admin" },
  ])("allows $accessRole users", (user) => {
    mockUser = user;
    render(<CampaignManagerScreen />);

    expect(screen.getByText("キャンペーン管理")).toBeTruthy();
    expect(screen.getByText("作成")).toBeTruthy();
    expect(screen.queryByText("運営メンバーのみアクセスできます")).toBeNull();
  });
});
