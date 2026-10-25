import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Öffentliche Website (indexierbar)
const WEBSITE_PATHS = ["/", "/impressum", "/datenschutz", "/robots.txt", "/sitemap.xml"];
// Ohne Anmeldung erreichbar
const PUBLIC_PATHS = ["/login", "/passwort-vergessen", "/passwort-zuruecksetzen", "/einladung", "/auth", "/api/public", "/datenschutz", "/impressum", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"];

/** Erneuert die Sitzung und leitet nicht angemeldete Benutzer auf die Login-Seite. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
