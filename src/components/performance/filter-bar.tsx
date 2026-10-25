import { FilterBar, FilterSelect } from "@/components/filters";
import { DateRangeFilter } from "@/components/date-range";
import { PERIOD_LABELS, todayBerlin, type PeriodKey } from "@/lib/dates";
import { STATUS_LABEL } from "@/components/performance/status-badge";
import { STATUSES, type PerformanceFilters } from "@/lib/performance-filters";

export function PerformanceFilterBar({
  f,
  employees,
  products,
  teams,
  roles,
  showStatus = true,
}: {
  f: PerformanceFilters;
  employees?: { id: string; first_name: string; last_name: string }[];
  products: { id: string; name: string }[];
  teams?: { id: string; name: string }[];
  roles?: { key: string; name: string }[];
  showStatus?: boolean;
}) {
  return (
    <FilterBar>
      <FilterSelect
        param="zeitraum"
        label="Zeitraum"
        value={f.period}
        options={[...(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => ({ value: k, label: PERIOD_LABELS[k] })), { value: "frei", label: "Benutzerdefiniert" }]}
      />
      {f.period === "frei" ? <DateRangeFilter from={f.from} to={f.to} max={todayBerlin()} /> : null}
      {teams && teams.length > 0 ? <FilterSelect param="team" label="Team" value={f.teamId} allLabel="Alle Teams" options={teams.map((t) => ({ value: t.id, label: t.name }))} /> : null}
      {roles ? <FilterSelect param="rolle" label="Rolle" value={f.role} allLabel="Alle Rollen" options={roles.map((r) => ({ value: r.key, label: r.name }))} /> : null}
      {employees && employees.length > 1 ? (
        <FilterSelect param="mitarbeiter" label="Mitarbeiter" value={f.userId} allLabel="Alle Mitarbeiter" options={employees.map((e) => ({ value: e.id, label: `${e.last_name}, ${e.first_name}` }))} />
      ) : null}
      <FilterSelect param="produkt" label="Produkt" value={f.productId} allLabel="Alle Produkte" options={products.map((p) => ({ value: p.id, label: p.name }))} />
      {showStatus ? <FilterSelect param="status" label="Status" value={f.status} allLabel="Alle Status" options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /> : null}
    </FilterBar>
  );
}
