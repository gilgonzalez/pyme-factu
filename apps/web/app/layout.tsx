import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
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
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
