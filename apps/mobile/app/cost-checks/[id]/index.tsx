import { useLocalSearchParams } from "expo-router";
import { CostCheckDetail } from "@/components/costChecks/CostCheckDetail";
export default function CostCheckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CostCheckDetail id={id ?? ""} />;
}
