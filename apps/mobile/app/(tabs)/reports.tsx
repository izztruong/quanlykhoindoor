import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/components/layout/AppHeader";
import { NavMenu } from "@/components/layout/NavMenu";
import { reportSections } from "@/components/layout/navConfig";
import { Screen } from "@/components/ui/Screen";
import { useCurrentUser } from "@/lib/auth";
import { colors } from "@/lib/theme";

export default function ReportsTab() {
  const { data: user } = useCurrentUser();

  return (
    <View style={styles.root}>
      <AppHeader title="Báo cáo" />
      <Screen withTabBar>
        <NavMenu sections={reportSections} user={user} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
