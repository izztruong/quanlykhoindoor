import { Alert, Linking } from "react-native";

// Địa chỉ trang web công khai, độc lập API Render. Điền URL chính thức sau khi deploy trang web.
export const PRIVACY_POLICY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() ?? "";

export async function openPrivacyPolicy() {
  try {
    const url = new URL(PRIVACY_POLICY_URL);
    if (url.protocol !== "https:") throw new Error("Invalid privacy policy URL");
    await Linking.openURL(url.toString());
  } catch {
    Alert.alert("Chưa mở được chính sách", "Vui lòng thử lại sau hoặc liên hệ quản trị viên để nhận chính sách quyền riêng tư.");
  }
}
