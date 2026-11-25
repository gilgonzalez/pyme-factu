import type { NextConfig } from "next";

const development = process.env["NODE_ENV"] === "development";
const production = process.env["FACTURALIBRE_ENV"] === "production";

/**
 * CSP (Fase 7). Sin nonces: obligarían a renderizar todo dinámicamente y anularían el prerender parcial
 * (cacheComponents), así que script-src admite 'unsafe-inline' (los scripts de arranque de Next van en línea).
 * Riesgo residual documentado en docs/security/security-architecture.md: lo mitigan el escapado de React, que no
 * haya HTML inyectado y que todo lo demás esté cerrado a terceros. En `next dev` hace falta eval y WebSocket (HMR).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${development ? " ws:" : ""}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS solo en producción (siempre detrás de HTTPS); en local rompería el acceso por HTTP.
  ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Imagen Docker mínima: .next/standalone + server.js
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default nextConfig;
