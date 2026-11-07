import type { Browser } from "@playwright/test";

/** Verkäufer-Karte der Partner-Übersicht nachbauen und abfotografieren (Handy-Screenshot) */
export async function cardShot(browser: Browser, name: string, mid: [number, number], big: [number, number]) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const box = "border:1px solid #ddd;border-radius:12px;padding:14px;margin:10px 0";
  await page.setContent(`<body style="font:15px -apple-system,Arial,sans-serif;color:#1f2937;margin:16px">
    <div style="font-size:26px;font-weight:700;text-align:center;margin-bottom:20px">Partner D2D</div>
    <div style="display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border-radius:50%;background:#f59e0b"></div>
      <div><b style="font-size:17px">${name}</b> <span style="background:#eef2f7;padding:2px 8px;border-radius:6px;margin-left:8px">Team Erlen</span>
      <div style="color:#6b7280">${mid[1] + big[1]} · ${mid[0] + big[0]} · 0 · 0 · 100%</div></div></div>
    <div style="${box}">Gesamt<div style="font-size:28px;font-weight:700">${mid[1] + big[1]}</div></div>
    <div style="${box}">Disqualifizierung<p style="color:#9ca3af;text-align:center">Keine Disqualifizierungen</p></div>
    <div style="${box}"><div style="font-weight:600">Anzahl Module</div>
      <div style="margin-top:10px;font-weight:600">15-39 Module <span style="color:#9ca3af">· 50%</span></div>
      <div style="font-size:22px;font-weight:700">${mid[0]} <span style="color:#9ca3af;font-weight:400">/ ${mid[1]}</span></div>
      <hr><div style="font-weight:600">&gt;39 Module <span style="color:#9ca3af">· 50%</span></div>
      <div style="font-size:22px;font-weight:700">${big[0]} <span style="color:#9ca3af;font-weight:400">/ ${big[1]}</span></div></div></body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}
