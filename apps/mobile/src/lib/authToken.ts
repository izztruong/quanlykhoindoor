import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "kho_token";
const REMEMBER_KEY = "kho_remember_login";

/** Mặc định bật để giữ hành vi của các phiên đã lưu trước khi có tuỳ chọn này. */
export async function getRememberLogin(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(REMEMBER_KEY)) !== "false";
  } catch {
    return true;
  }
}

/**
 * Bản sao trong RAM để mỗi request không phải chờ một lượt đọc Keychain/Keystore. `undefined`
 * nghĩa là chưa từng đọc, `null` nghĩa là đã đọc và không có token.
 */
let cached: string | null | undefined;
let revision = 0;

export async function getAuthToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  const readRevision = revision;
  try {
    const remember = await SecureStore.getItemAsync(REMEMBER_KEY);
    const stored = remember === "false" ? null : (await SecureStore.getItemAsync(TOKEN_KEY)) ?? null;
    // Một lượt đọc lúc khởi động về muộn không được ghi đè phiên vừa đăng nhập/đăng xuất.
    if (revision === readRevision) cached = stored;
  } catch {
    // Keychain có thể chưa mở khoá (máy vừa khởi động) — coi như chưa đăng nhập, đừng làm app chết.
    if (revision === readRevision) cached = null;
  }
  return cached ?? null;
}

export async function setAuthToken(token: string, rememberLogin = true): Promise<void> {
  await SecureStore.setItemAsync(REMEMBER_KEY, String(rememberLogin));
  if (rememberLogin) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    // Bỏ phiên đã lưu từ trước để lần khởi động sau không đăng nhập lại tài khoản cũ.
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  revision++;
  cached = token;
}

export async function clearAuthToken(): Promise<void> {
  revision++;
  cached = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
