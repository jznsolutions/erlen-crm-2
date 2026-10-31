import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Öffentliche Website, Logo/Symbole und Design-Dateien dürfen gelesen werden (sonst zeigt Google kein Logo).
// Interne Bereiche sind zusätzlich per Anmeldung und „noindex“ geschützt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/einrichtung", "/portal-einrichtung", "/einladung/", "/termin/absagen/", "/demo", "/auth/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
