import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { INSTALL_PROMPT_SCRIPT } from "@/components/install-app";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: { default: "FacturaLibre", template: "%s · FacturaLibre" },
  description: "Facturación gratuita para autónomos y empresas en España.",
  applicationName: "FacturaLibre",
  // iOS: a pantalla completa al añadirla a la pantalla de inicio, con su icono.
  appleWebApp: { capable: true, title: "FacturaLibre", statusBarStyle: "default" },
  icons: { apple: "/icons/apple" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#5a3ff2",
  // Pantalla completa también bajo la muesca; las barras fijas respetan la zona segura (env(safe-area-inset-*)).
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Guarda el aviso de «se puede instalar» aunque llegue antes de que la página esté lista (ver install-app).
            En el <body>, no en un <head> propio: con este, la página 404 en streaming se quedaba en «Cargando…». */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
