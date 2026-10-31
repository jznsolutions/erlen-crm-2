import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildMonthlyReport, previousMonth } from "@/lib/monthly-report";
import { todayBerlin } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Monatsbericht als PDF – nur mit agenturweiter Berichts- und Leistungsansicht
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!user.permissions.has("reports.read.all") || !user.permissions.has("performance.read.all")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  const month = request.nextUrl.searchParams.get("monat") ?? previousMonth(todayBerlin());
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || month > todayBerlin().slice(0, 7)) {
    return NextResponse.json({ error: "Ungültiger Monat" }, { status: 400 });
  }
  try {
    const { pdf, fileName } = await buildMonthlyReport(month);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[monatsbericht]", (e as Error).message);
    return NextResponse.json({ error: "Bericht konnte nicht erstellt werden. Ist das Datenbank-Update eingespielt?" }, { status: 500 });
  }
}
