import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPortalConfigured, supabasePublicKey, supabaseUrl } from "@/lib/env";

// Öffentliche Website (indexierbar)
const WEBSITE_PATHS = ["/", "/termin", "/impressum", "/datenschutz", "/robots.txt", "/sitemap.xml"];
// Ohne Anmeldung erreichbar
const PUBLIC_PATHS = ["/login", "/passwort-vergessen", "/passwort-zuruecksetzen", "/einladung", "/auth", "/api/public", "/datenschutz", "/impressum", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/demo", "/einrichtung", "/termin", "/api/cron"];

/** Erneuert die Sitzung und leitet nicht angemeldete Benutzer auf die Login-Seite. */
export async function updateSession(request: NextRequest) {
  const path0 = request.nextUrl.pathname;
  // Ohne Supabase-Konfiguration: nur die öffentliche Website, alles andere -> Hinweisseite
  if (!isPortalConfigured()) {
    if (WEBSITE_PATHS.includes(path0) || path0 === "/manifest.webmanifest" || path0 === "/portal-einrichtung" || path0 === "/einrichtung" || path0 === "/demo" || path0.startsWith("/demo/")) return NextResponse.next();
    if (path0.startsWith("/api/")) return NextResponse.json({ error: "Portal noch nicht eingerichtet" }, { status: 503 });
    const url = request.nextUrl.clone();
    url.pathname = "/portal-einrichtung";
    url.search = "";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl()!,
    supabasePublicKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Wichtig: Token wird kryptografisch geprüft (nicht nur aus dem Cookie gelesen).
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!isAuthenticated && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (path !== "/") url.searchParams.set("weiter", path);
    return NextResponse.redirect(url);
  }
  // Alles außer der öffentlichen Website wird für Suchmaschinen gesperrt
  if (!WEBSITE_PATHS.includes(path)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
