import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/impressum`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/datenschutz`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
