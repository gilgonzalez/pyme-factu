import type { Metadata } from "next";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FacturaLibre", template: "%s · FacturaLibre" },
  description: "Facturación gratuita para autónomos y empresas en España.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
