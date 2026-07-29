import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (ownerId: string, memberId: string) => `irotas_private_member_note:${ownerId}:${memberId}`;

export async function getPrivateMemberNote(ownerId: string, memberId: string): Promise<string> {
  return (await AsyncStorage.getItem(keyFor(ownerId, memberId))) ?? "";
}

export async function savePrivateMemberNote(ownerId: string, memberId: string, note: string): Promise<void> {
  await AsyncStorage.setItem(keyFor(ownerId, memberId), note.trim());
}
