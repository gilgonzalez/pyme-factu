import type { ReactNode } from "react";

/** Bloque de una página con su título y explicación; `surface` lo envuelve en una tarjeta. */
export function PageSection({
  id,
  title,
  description,
  surface = false,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly surface?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={surface ? "surface grid gap-4 p-5 sm:p-6" : "grid gap-3"}>
      <div className="grid gap-0.5">
        <h2 id={id} className={surface ? "font-semibold" : "text-lg font-semibold"}>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
