import { describe, expect, it } from "vitest";
import { gapToNext } from "@/components/dashboard/competitions";

const r = (rank: number, total: number, is_me = false) => ({ rank, user_id: `u${rank}${total}`, display_name: "X", team_name: null, total, is_me });

describe("Wettbewerb: Abstand zum nächsten Platz", () => {
  it("braucht einen mehr als der Abstand zur nächstbesseren Person", () => {
    expect(gapToNext([r(1, 10), r(2, 7), r(3, 5, true)])).toBe(3);
    expect(gapToNext([r(1, 10, true), r(2, 7)])).toBeNull();
    expect(gapToNext([r(1, 10), r(1, 10, true)])).toBeNull();
    expect(gapToNext([r(1, 10)])).toBeNull();
  });
});
