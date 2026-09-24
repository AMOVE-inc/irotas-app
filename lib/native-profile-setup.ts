import AsyncStorage from "@react-native-async-storage/async-storage";

export function nativeProfileSetupKey(userId: number | string) {
  return `irotas_native_profile_setup_v1:${userId}`;
}

export async function markNativeProfileSetupComplete(userId: number | string) {
  await AsyncStorage.setItem(nativeProfileSetupKey(userId), "1");
}

export async function hasCompletedNativeProfileSetup(userId: number | string) {
  return (await AsyncStorage.getItem(nativeProfileSetupKey(userId))) === "1";
}
