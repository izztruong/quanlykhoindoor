import { Tabs } from "expo-router/js-tabs";
import { FloatingTabBar } from "@/components/layout/FloatingTabBar";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Trang chủ" }} />
      <Tabs.Screen name="operations" options={{ title: "Nghiệp vụ" }} />
      <Tabs.Screen name="reports" options={{ title: "Báo cáo" }} />
      <Tabs.Screen name="more" options={{ title: "Khác" }} />
    </Tabs>
  );
}
