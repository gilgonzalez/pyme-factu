import Link from "next/link";

/** Marca: cuadrado violeta con una factura esquemática. */
export function BrandMark({ className = "" }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`size-6 shrink-0 ${className}`}>
      <rect width="24" height="24" rx="6" fill="var(--primary)" />
      <path d="M8 6.5h5.5L16.5 9.5V17.5H8Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10.2 12.2h4M10.2 14.8h2.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ href = "/organizaciones", compactOnMobile = false }: { readonly href?: string; readonly compactOnMobile?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
      <BrandMark />
      <span className={compactOnMobile ? "max-lg:sr-only" : ""}>FacturaLibre</span>
    </Link>
  );
}
