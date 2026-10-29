import type { MetadataRoute } from "next";

// Web-App-Manifest: Symbol und Name, wenn die Seite auf dem Handy-Startbildschirm gespeichert wird.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERLEN Vertriebsagentur",
    short_name: "ERLEN",
    description: "Website und Mitarbeiterportal der ERLEN Vertriebsagentur",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#060912",
    theme_color: "#060912",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
