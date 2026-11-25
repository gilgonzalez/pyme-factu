import Link from "next/link";

/** Marca: una matriz de talonario con su línea perforada. */
export function BrandMark({ className = "" }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={`size-7 shrink-0 ${className}`}>
      <rect x="1" y="3" width="26" height="22" rx="3" fill="var(--primary)" />
      <path d="M10 3v22" stroke="var(--card)" strokeWidth="2" strokeDasharray="2 2.4" />
      <path d="M14 10h9M14 14h9M14 18h6" stroke="var(--card)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ href = "/organizaciones" }: { readonly href?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-[-0.01em]">
      <BrandMark />
      FacturaLibre
    </Link>
  );
}
