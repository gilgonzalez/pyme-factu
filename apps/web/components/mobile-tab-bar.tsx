"use client";
// Barra de pestañas inferior del móvil: como mucho cinco pestañas de ancho fijo (nunca se desplaza ni corta
// textos). Lo que no cabe va en «Más», un panel emergente nativo (popover: se cierra al tocar fuera o con Escape).
import { Ellipsis, Info } from "lucide-react";
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { InstallAppItem } from "@/components/install-app";
import { NavIcon } from "@/components/nav-pending";

export interface TabItem {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  /** Rótulo corto para la pestaña, si el normal no cabe («Registros VERI*FACTU» → «Registros»). */
  readonly shortLabel?: string;
  readonly icon: ReactNode;
  readonly current: boolean;
  /** La acción principal (nueva factura): icono sobre un círculo violeta. */
  readonly emphasis?: boolean;
}

const MAX_TABS = 5;
const PANEL_ID = "mas-secciones";

const TAB =
  "flex h-full flex-col items-center justify-center gap-0.5 px-0.5 text-[0.6875rem] leading-tight font-medium text-muted-foreground transition-colors active:bg-black/[0.04] aria-[current=page]:text-primary";

function Tab({ item }: { readonly item: TabItem }) {
  return (
    <Link href={item.href} aria-current={item.current ? "page" : undefined} aria-label={item.shortLabel === undefined ? undefined : item.label} className={TAB}>
      {item.emphasis === true ? (
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm [&>span>svg]:size-[1.1rem]">
          <NavIcon>{item.icon}</NavIcon>
        </span>
      ) : (
        <span className="grid size-6 place-items-center [&>span>svg]:size-5 [&>span]:size-5">
          <NavIcon>{item.icon}</NavIcon>
        </span>
      )}
      <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
    </Link>
  );
}

export function MobileTabBar({ label, items }: { readonly label: string; readonly items: readonly TabItem[] }) {
  const panel = useRef<HTMLDivElement>(null);
  const overflow = items.length > MAX_TABS;
  const tabs = overflow ? items.slice(0, MAX_TABS - 1) : items;
  const more = overflow ? items.slice(MAX_TABS - 1) : [];
  const close = () => panel.current?.hidePopover();
  const columns = tabs.length + (overflow ? 1 : 0);

  return (
    <nav
      aria-label={label}
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(16_16_32/0.06)] backdrop-blur lg:hidden"
    >
      <ul className="grid h-14" style={{ gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` }}>
        {tabs.map((item) => (
          <li key={item.id}>
            <Tab item={item} />
          </li>
        ))}
        {overflow ? (
          <li>
            <button
              type="button"
              popoverTarget={PANEL_ID}
              data-active={more.some((item) => item.current)}
              className={`${TAB} w-full data-[active=true]:text-primary`}
            >
              <span aria-hidden="true" className="grid size-6 place-items-center">
                <Ellipsis className="size-5" />
              </span>
              Más
            </button>
          </li>
        ) : null}
      </ul>
      {overflow ? (
        <div
          id={PANEL_ID}
          ref={panel}
          popover="auto"
          className="inset-auto right-2 left-2 w-auto bottom-[calc(4rem+env(safe-area-inset-bottom))] m-0 rounded-2xl border bg-card p-2 text-foreground shadow-xl backdrop:bg-black/20"
        >
          <ul className="grid gap-0.5">
            {more.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={item.current ? "page" : undefined}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-[0.95rem] font-medium hover:bg-black/[0.04] aria-[current=page]:bg-accent aria-[current=page]:text-primary [&_svg]:size-5 [&_svg]:text-muted-foreground aria-[current=page]:[&_svg]:text-primary"
                >
                  <NavIcon>{item.icon}</NavIcon>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 grid gap-0.5 border-t pt-1.5">
            <InstallAppItem className="px-3 py-3 text-[0.95rem]" />
            <Link
              href="/acerca"
              onClick={close}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[0.95rem] font-medium text-muted-foreground hover:bg-black/[0.04]"
            >
              <Info aria-hidden="true" className="size-4" />
              Acerca de
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
