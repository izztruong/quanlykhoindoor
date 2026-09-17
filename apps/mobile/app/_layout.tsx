import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastContainer } from "@/components/ui/Toast";
import { setUnauthorizedHandler } from "@/lib/apiClient";
import { useCurrentUser } from "@/lib/auth";
import { hrefFromResponse, Notifications, registerPushToken } from "@/lib/pushNotifications";
import { QueryProvider } from "@/lib/queryClient";
import { colors, fontSize } from "@/lib/theme";
import { pushToast } from "@/lib/toastBus";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <StatusBar style="dark" />
          <RootNavigator />
          <ToastContainer />
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Chặn truy cập nằm ở đây thay vì ở từng màn — cùng cách bản web làm trong app/(app)/layout.tsx.
 * Quyền thì server vẫn kiểm lại mỗi request, đây chỉ là lớp hiển thị.
 */
function RootNavigator() {
  const { data: user, isLoading } = useCurrentUser();
  const segments = useSegments();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    // 401 ở bất kỳ request nào (vd đổi mật khẩu làm chết token) phải đá về màn đăng nhập ngay.
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(["auth", "me"], null);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  useEffect(() => {
    if (isLoading) return;
    const onLoginScreen = segments[0] === "login";
    if (!user && !onLoginScreen) router.replace("/login");
    if (user && onLoginScreen) router.replace("/");
  }, [user, isLoading, segments, router]);

  // Ghi token thông báo mỗi khi có phiên — cả lúc vừa đăng nhập lẫn lúc mở lại app với phiên cũ.
  // Lỗi (mất mạng, bị từ chối quyền) không được chặn việc dùng app.
  const userId = user?.id;
  useEffect(() => {
    // Không await, không được chặn việc dùng app — nhưng lỗi phải hiện ra để còn biết mà sửa,
    // thay vì im lặng mãi mãi như trước (đã từng khiến không ai phát hiện thiếu khoá FCM).
    if (userId) registerPushToken().catch((err) => pushToast("error", err instanceof Error ? err.message : String(err)));
  }, [userId]);

  // Thông báo tới lúc đang mở app: số trên chuông phải đổi ngay, không đợi lần tải lại sau.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => sub.remove();
  }, [queryClient]);

  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);
  useEffect(() => {
    // Chờ gác cửa đăng nhập xong: nếu điều hướng sớm thì router.replace("/login") phía trên đè mất đích.
    if (isLoading || !user || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handledResponseId.current === id) return;
    handledResponseId.current = id;

    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    const href = hrefFromResponse(lastResponse);
    if (href && lastResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      router.push(href as Href);
    }
    // Không xoá thì lần mở app sau hook trả lại đúng phản hồi cũ và nhảy về trang đó lần nữa.
    Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [lastResponse, user, isLoading, router, queryClient]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontSize: fontSize.lg, fontWeight: "700" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
