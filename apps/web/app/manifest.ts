import type { MetadataRoute } from "next";

/** Manifiesto de la PWA: FacturaLibre instalable en el móvil y el escritorio, a pantalla completa. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FacturaLibre",
    short_name: "FacturaLibre",
    description: "Facturación gratuita para autónomos y empresas en España, con VERI*FACTU.",
    lang: "es",
    dir: "ltr",
    start_url: "/organizaciones",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#5a3ff2",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
