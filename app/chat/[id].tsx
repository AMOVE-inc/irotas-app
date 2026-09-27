// Keep `/chat?id=...` as a compatibility entry point while native in-app
// navigation uses `/chat/[id]`, with the room id as part of the route identity.
export { default } from "./index";
