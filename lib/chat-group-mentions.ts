import { mentionsViewer } from "./mention-matching";

export type FreeChatMentionGroups = {
  roomEveryone: boolean;
  branchEveryone: boolean;
  kanto: boolean;
  kansai: boolean;
};

/** Resolve group labels exactly, so @everyoneさん does not notify the room. */
export function freeChatMentionGroups(content: string, roomId: string): FreeChatMentionGroups {
  return {
    roomEveryone: mentionsViewer(content, ["全体", "everyone", "全員", "here", "チャット内の人全員"]),
    branchEveryone: (roomId === "branch-kanto-free" || roomId === "branch-kansai-free") && mentionsViewer(content, ["支部全員"]),
    kanto: mentionsViewer(content, ["関東支部"]),
    kansai: mentionsViewer(content, ["関西支部"]),
  };
}
