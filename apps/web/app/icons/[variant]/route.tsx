// Iconos PNG de la PWA, generados a partir de la marca (cuadrado violeta con una factura esquemática).
// «maskable» deja el símbolo dentro de la zona segura porque el sistema recorta el icono.
import { ImageResponse } from "next/og";

const VARIANTS: Readonly<Record<string, { readonly size: number; readonly maskable: boolean }>> = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
  apple: { size: 180, maskable: true },
};

export async function GET(_request: Request, { params }: RouteContext<"/icons/[variant]">): Promise<Response> {
  const { variant } = await params;
  const config = VARIANTS[variant];
  if (config === undefined) return new Response("Icono no encontrado.", { status: 404 });
  const { size, maskable } = config;
  // Con «maskable», el fondo violeta llena el lienzo; si no, un cuadrado redondeado sobre transparente.
  const glyph = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "#5a3ff2" : "transparent" }}>
        <div
          style={{
            width: maskable ? glyph : size,
            height: maskable ? glyph : size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#5a3ff2",
            borderRadius: maskable ? 0 : size * 0.22,
          }}
        >
          <svg width={glyph} height={glyph} viewBox="0 0 24 24">
            <path d="M8 6.5h5.5L16.5 9.5V17.5H8Z" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10.2 12.2h4M10.2 14.8h2.6" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
