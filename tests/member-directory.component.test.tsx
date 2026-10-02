import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockSetMemberFollow = jest.fn();

const members = [
  {
    id: "IRO0001", userId: 1, publicUserId: "kazuma", displayName: "かずま", accessRole: "member",
    branches: ["kanto"], memberTerm: "第1期", memberRank: "gold", achievementBadges: [], discordRoles: [],
    profile: { bio: "肉が好き" }, xp: 100, participationCount: 10, organizerCount: 2,
    joinedAt: "2026-01-01", followerCount: 1, followingCount: 0, isFollowing: false, followsViewer: false, isFriend: false,
  },
  {
    id: "IRO0002", userId: 2, publicUserId: "aoi", displayName: "あおい", accessRole: "club_leader",
    branches: ["kansai"], memberTerm: "第2期", memberRank: "silver", achievementBadges: [], discordRoles: [],
    profile: { bio: "寿司が好き" }, xp: 50, participationCount: 5, organizerCount: 0,
    joinedAt: "2026-02-01", followerCount: 0, followingCount: 0, isFollowing: false, followsViewer: false, isFriend: false,
  },
];

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/components/new-member-mark", () => ({ NewMemberMark: () => null }));
jest.mock("@/components/member-rank-badge", () => ({
  stripRankFromName: (name: string) => name,
  MemberRankBadge: () => null,
  MemberRoleBadge: () => null,
  MemberClubLeaderBadges: () => null,
}));
jest.mock("@/components/ui/icon-symbol", () => ({ IconSymbol: () => null }));
jest.mock("@/components/authenticated-image", () => ({ AuthenticatedImage: () => null }));
jest.mock("@/hooks/use-colors", () => ({ useColors: () => ({ foreground: "#111", muted: "#666", border: "#ddd", surface: "#fff", background: "#fff" }) }));
jest.mock("@/lib/auth-context", () => ({ useAuthContext: () => ({ user: { id: 1 } }) }));
jest.mock("@/lib/_core/api", () => ({
  peekMemberDirectory: () => members,
  getMemberDirectory: jest.fn(() => new Promise(() => {})),
  setMemberFollow: (...args: unknown[]) => mockSetMemberFollow(...args),
}));

import MembersScreen from "@/app/members";

describe("member directory component integration", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSetMemberFollow.mockReset();
    mockSetMemberFollow.mockImplementation(async (id: string, following: boolean) => ({
      ...members.find((member) => member.id === id), isFollowing: following, followerCount: following ? 1 : 0,
    }));
  });

  it("filters members by name and public user id", () => {
    render(<MembersScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("名前またはユーザーIDで検索"), "aoi");

    expect(screen.getByText("あおい")).toBeTruthy();
    expect(screen.queryByText("かずま")).toBeNull();
  });

  it("optimistically follows another member and persists the operation", async () => {
    render(<MembersScreen />);
    fireEvent.press(screen.getAllByText("＋フォロー")[0], { stopPropagation: jest.fn() });

    expect(screen.getAllByText("フォロー中").length).toBeGreaterThan(0);
    await waitFor(() => expect(mockSetMemberFollow).toHaveBeenCalledWith("IRO0002", true));
  });
});
