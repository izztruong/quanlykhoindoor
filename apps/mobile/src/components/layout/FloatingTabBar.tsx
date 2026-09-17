import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize, radius, shadow, spacing } from "@/lib/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/** Icon theo tên route trong app/(tabs); khoá phải khớp tên file. */
const icons: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: "home", inactive: "home-outline" },
  operations: { active: "grid", inactive: "grid-outline" },
  reports: { active: "bar-chart", inactive: "bar-chart-outline" },
  more: { active: "menu", inactive: "menu-outline" },
};

/**
 * Thanh tab nổi trên nền, bo tròn — thay cho thanh dính đáy mặc định. Các màn hình trong tab phải
 * chừa khoảng trống đáy bằng TAB_BAR_CLEARANCE để nội dung không bị thanh này che.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const icon = icons[route.name] ?? { active: "ellipse", inactive: "ellipse-outline" };
          const label = typeof options.title === "string" ? options.title : route.name;

          function onPress() {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={styles.item}
            >
              <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                <Ionicons
                  name={focused ? icon.active : icon.inactive}
                  size={22}
                  color={focused ? colors.primary : colors.textFaint}
                />
              </View>
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.xl + 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...shadow.floating,
  },
  item: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
  iconWrap: {
    // Gần vuông (36×32) nên bo góc 12 đọc ra hình vuông mềm; hộp rộng hơn thì cùng bán kính đó lại
    // trông như chữ nhật.
    width: 36,
    height: 32,
    borderRadius: radius.md,
    // Nền khai sẵn màu trong suốt thay vì chỉ thêm khi tab được chọn: trên Android, View chưa có
    // background thì chưa có drawable bo góc, lúc đổi tab mới dựng ra nên nháy thành khối vuông.
    // overflow ép Android cắt theo đúng đường bo, không phụ thuộc drawable.
    backgroundColor: "transparent",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: colors.primarySoft },
  label: { fontSize: fontSize.xs, color: colors.textFaint, fontWeight: "500" },
  labelActive: { color: colors.primary, fontWeight: "700" },
});
