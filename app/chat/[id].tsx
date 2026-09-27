// Keep the existing `/chat?id=...` screen as a compatibility entry point for
// older links, while native in-app navigation uses `/chat/[id]` so the room id
// cannot be dropped while the root stack is reconstructed.
export { default } from "../chat";
