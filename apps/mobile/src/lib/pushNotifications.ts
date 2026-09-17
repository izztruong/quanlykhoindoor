import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./apiClient";

/** Phải trùng ANDROID_CHANNEL_ID phía server (apps/server/src/modules/notifications/notifications.service.ts). */
const ANDROID_CHANNEL_ID = "default";
const PUSH_TOKEN_KEY = "kho_push_token";

// Vẫn hiện banner khi app đang mở — không có dòng này thì thông báo tới lúc đang dùng app sẽ im lặng.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function easProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export type PushAvailability = "available" | "expo-go" | "not-configured";

/**
 * Thông báo đẩy từ server KHÔNG chạy trong Expo Go trên Android kể từ SDK 53 — cần bản development
 * build. Thiếu projectId (chưa `eas init`) thì cũng không lấy được token. Hai trường hợp đó bỏ qua êm
 * để mọi phần khác của app vẫn thử được bằng Expo Go.
 */
export function pushAvailability(): PushAvailability {
  if (isRunningInExpoGo() && Platform.OS === "android") return "expo-go";
  if (!easProjectId()) return "not-configured";
  return "available";
}

/**
 * Xin quyền và ghi token của máy này lên server. Gọi mỗi lần có phiên đăng nhập: token có thể đổi,
 * và server upsert theo token nên gọi lặp lại không tạo bản ghi trùng.
 */
export async function registerPushToken(): Promise<void> {
  if (pushAvailability() !== "available") return;

  // Android 13 không hiện hộp thoại xin quyền khi app chưa có kênh nào — phải tạo kênh TRƯỚC khi xin.
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Thông báo chung",
        importance: Notifications.AndroidImportance.HIGH,
      });
    } catch (err) {
      throw new Error(`Tạo kênh Android thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let granted: boolean;
  try {
    const current = await Notifications.getPermissionsAsync();
    granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  } catch (err) {
    throw new Error(`Xin quyền thông báo thất bại: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!granted) return;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() })).data;
  } catch (err) {
    // Lỗi hay gặp nhất ở bước này: chưa gắn khoá FCM V1 (Google Service Account) cho project trên EAS.
    throw new Error(`Lấy Expo push token thất bại: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    await api.post<void>("/notifications/push-tokens", { token, platform: Platform.OS === "ios" ? "ios" : "android" });
  } catch (err) {
    throw new Error(`Gửi token lên server thất bại: ${err instanceof Error ? err.message : String(err)}`);
  }
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

/**
 * Gỡ token khỏi tài khoản hiện tại. Phải gọi TRƯỚC khi phiên chết (đăng xuất, đổi mật khẩu) vì API
 * cần bearer còn sống. Lỗi thì bỏ qua: server tự chuyển token sang chủ mới ở lần đăng nhập kế tiếp.
 */
export async function unregisterPushToken(sessionEnded?: AbortSignal): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (!token || sessionEnded?.aborted) return;
    // Không truyền signal vào request: Render có thể cần lâu hơn thời gian app chờ đăng xuất.
    // Bearer được lấy lúc gửi; server chỉ gỡ token còn thuộc đúng tài khoản cũ.
    await api.delete<void>(`/notifications/push-tokens/${encodeURIComponent(token)}`);
    // Phản hồi về muộn không được xoá khoá push mà phiên đăng nhập mới đang dùng.
    if (!sessionEnded?.aborted) await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // Mất mạng hay Render đang ngủ không được chặn việc đăng xuất.
  }
}

/** Đích điều hướng server gắn vào thông báo, vd "/orders/abc". */
export function hrefFromResponse(response: Notifications.NotificationResponse): string | undefined {
  const href = response.notification.request.content.data?.href;
  return typeof href === "string" && href.startsWith("/") ? href : undefined;
}

export { Notifications };
