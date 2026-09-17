import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "kho_token";

/**
 * Bản sao trong RAM để mỗi request không phải chờ một lượt đọc Keychain/Keystore. `undefined`
 * nghĩa là chưa từng đọc, `null` nghĩa là đã đọc và không có token.
 */
let cached: string | null | undefined;

export async function getAuthToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = (await SecureStore.getItemAsync(TOKEN_KEY)) ?? null;
  } catch {
    // Keychain có thể chưa mở khoá (máy vừa khởi động) — coi như chưa đăng nhập, đừng làm app chết.
    cached = null;
  }
  return cached;
}

export async function setAuthToken(token: string): Promise<void> {
  cached = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
