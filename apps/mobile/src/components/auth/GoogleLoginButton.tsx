import Constants, { ExecutionEnvironment } from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { useGoogleLogin } from "@/lib/auth";
import { googleSignInErrorCode, googleSignInErrorMessage } from "@/lib/googleSignInError";
import { colors, spacing } from "@/lib/theme";

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export function GoogleLoginButton({ disabled, rememberLogin, onBusyChange }: {
  disabled?: boolean;
  rememberLogin: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const login = useGoogleLogin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signingIn = useRef(false);
  useEffect(() => { onBusyChange?.(busy || login.isPending); }, [busy, login.isPending, onBusyChange]);

  async function signIn() {
    if (signingIn.current || disabled) return;
    signingIn.current = true;
    setBusy(true);
    setError("");
    try {
      if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
        setError("Đăng nhập Google cần bản development build mới, không dùng được trong Expo Go.");
        return;
      }
      // Nạp khi bấm để các development build cũ thiếu native module vẫn mở được app.
      const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } =
        require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin");
      try {
        GoogleSignin.configure({ webClientId });
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response)) return;
        if (!response.data.idToken) {
          setError("Google chưa trả mã đăng nhập. Vui lòng kiểm tra cấu hình Google Web Client ID.");
          return;
        }
        // Lỗi API đã được queryClient hiển thị bằng toast.
        login.mutate({ credential: response.data.idToken, rememberLogin });
      } catch (err) {
        if (isErrorWithCode(err) && (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS)) return;
        if (__DEV__) console.warn("[Google Sign-In] Native error code:", googleSignInErrorCode(err) ?? "UNKNOWN");
        setError(isErrorWithCode(err) && err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
          ? "Dịch vụ Google Play chưa khả dụng. Vui lòng cập nhật rồi thử lại."
          : googleSignInErrorMessage(err));
      }
    } catch {
      setError("Bản app này chưa có Google Sign-In. Vui lòng cài bản development build mới.");
    } finally {
      signingIn.current = false;
      setBusy(false);
    }
  }

  // iOS: chưa có OAuth client iOS, và App Store (Guideline 4.8) đòi kèm Sign in with Apple khi có đăng nhập Google.
  if (!webClientId || Platform.OS === "ios") return null;
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ textAlign: "center", color: colors.textMuted }}>hoặc</Text>
      <Button title="Đăng nhập bằng Google" variant="secondary" fullWidth
        icon={<Ionicons name="logo-google" size={20} color={colors.primary} />}
        loading={busy || login.isPending} disabled={disabled} onPress={signIn} />
      {error ? <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : null}
    </View>
  );
}
