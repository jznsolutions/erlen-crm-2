import { Badge } from "@/components/ui/badge";
import type { PerformanceStatus } from "@/lib/metrics";

export const STATUS_LABEL: Record<PerformanceStatus, string> = {
  entwurf: "Entwurf",
  eingereicht: "Eingereicht",
  bestaetigt: "Bestätigt",
  abgelehnt: "Abgelehnt",
  storniert: "Storniert",
  korrigiert: "Korrigiert",
};
const VARIANT = {
  entwurf: "neutral",
  eingereicht: "info",
  bestaetigt: "success",
  abgelehnt: "danger",
  storniert: "danger",
  korrigiert: "warning",
} as const;

export function StatusBadge({ status }: { status: PerformanceStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
