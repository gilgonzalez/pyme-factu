"use client";
// «Instalar app». Los navegadores casi nunca ofrecen instalar la PWA por su cuenta: Safari (iPhone/iPad) no lo hace
// nunca y Chrome solo a veces. Aquí: si el navegador lo permite (beforeinstallprompt), su diálogo nativo; si no, los
// pasos para hacerlo a mano. Ya instalada (abierta como app), no se muestra nada.
import { Download, Share, X } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Lo guarda el script en línea del layout: el evento puede llegar antes de que React hidrate. */
    __installPrompt?: InstallPromptEvent | undefined;
  }
}

/** Cómo se instala en este navegador: diálogo nativo, pasos de Safari, pasos del menú de Chrome, o nada. */
export type InstallMethod = "prompt" | "ios" | "menu" | null;

const DISMISSED_KEY = "facturalibre:instalar-descartado";

/** Script en línea (layout raíz) que guarda el evento de instalación en cuanto llega. */
export const INSTALL_PROMPT_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){window.__installPrompt=e;window.dispatchEvent(new Event('facturalibre:instalable'))});";

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Instalada en esta visita (appinstalled): la pestaña sigue abierta en el navegador, pero ya no hay que ofrecerla. */
let installedNow = false;
const CHANGED = "facturalibre:instalar-cambio";
const notify = () => window.dispatchEvent(new Event(CHANGED));

function subscribe(onChange: () => void): () => void {
  const installed = () => {
    installedNow = true;
    window.__installPrompt = undefined;
    onChange();
  };
  window.addEventListener("facturalibre:instalable", onChange);
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("appinstalled", installed);
  return () => {
    window.removeEventListener("facturalibre:instalable", onChange);
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("appinstalled", installed);
  };
}

function detect(): InstallMethod {
  if (installedNow || standalone()) return null;
  if (window.__installPrompt !== undefined) return "prompt";
  const ua = navigator.userAgent;
  // iPadOS se presenta como un Mac con pantalla táctil.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "menu";
  return null;
}

function useInstall(): { readonly method: InstallMethod; readonly install: () => Promise<void> } {
  // En el servidor no se sabe nada del navegador: nada que ofrecer hasta hidratar.
  const method = useSyncExternalStore(subscribe, detect, () => null);
  return {
    method,
    async install() {
      const event = window.__installPrompt;
      if (event === undefined) return;
      await event.prompt();
      const { outcome } = await event.userChoice;
      // El evento solo sirve una vez; si lo rechaza, quedan los pasos del menú.
      window.__installPrompt = undefined;
      if (outcome === "accepted") installedNow = true;
      notify();
    },
  };
}

// Un navegador automatizado (pruebas E2E) no es alguien a quien ofrecer la app: el aviso le taparía la pantalla.
const isDismissed = (): boolean => navigator.webdriver || localStorage.getItem(DISMISSED_KEY) !== null;

function Steps({ method, onClose }: { readonly method: "ios" | "menu"; readonly onClose: () => void }) {
  return (
    <Modal title="Instala FacturaLibre" description="Tendrás su icono en la pantalla de inicio y se abrirá a pantalla completa, como una app." onClose={onClose}>
      <ol className="grid list-decimal gap-3 pb-2 pl-5 text-[0.95rem]">
        {method === "ios" ? (
          <>
            <li>
              Abre esta página en <strong>Safari</strong>.
            </li>
            <li>
              Toca el botón <strong>Compartir</strong> <Share aria-hidden="true" className="inline size-4 align-[-2px] text-primary" /> (abajo en el
              iPhone, arriba en el iPad).
            </li>
            <li>
              Elige <strong>«Añadir a pantalla de inicio»</strong> (si no lo ves, desliza hacia abajo en la lista) y toca <strong>Añadir</strong>.
            </li>
          </>
        ) : (
          <>
            <li>
              Abre el menú del navegador (<strong>⋮</strong>, arriba a la derecha).
            </li>
            <li>
              Elige <strong>«Instalar aplicación»</strong> o <strong>«Añadir a pantalla de inicio»</strong>.
            </li>
            <li>Confirma: el icono de FacturaLibre aparecerá con tus aplicaciones.</li>
          </>
        )}
      </ol>
    </Modal>
  );
}

function useInstallAction(): { readonly method: InstallMethod; readonly start: () => void; readonly dialog: ReactNode } {
  const { method, install } = useInstall();
  const [showSteps, setShowSteps] = useState(false);
  return {
    method,
    start: () => (method === "prompt" ? void install() : setShowSteps(true)),
    dialog: showSteps && (method === "ios" || method === "menu") ? <Steps method={method} onClose={() => setShowSteps(false)} /> : null,
  };
}

/** Entrada de menú (lateral, «Más»): siempre a mano mientras la app no esté instalada. */
export function InstallAppItem({ className = "" }: { readonly className?: string }) {
  const { method, start, dialog } = useInstallAction();
  if (method === null) return null;
  return (
    <>
      <button
        type="button"
        onClick={start}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-black/[0.04] hover:text-foreground ${className}`}
      >
        <Download aria-hidden="true" className="size-4 shrink-0" />
        Instalar app
      </button>
      {dialog}
    </>
  );
}

/**
 * Aviso flotante en móvil para instalarla, sobre la barra inferior: flota para no desplazar la página al aparecer
 * (tras hidratar), lo que haría que un toque cayera en otro sitio. Se puede descartar (se recuerda en este dispositivo).
 */
export function InstallAppBanner() {
  const { method, start, dialog } = useInstallAction();
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  if (method === null || dismissed) return dialog;
  return (
    <aside
      aria-label="Instalar la app"
      className="install-banner fixed inset-x-3 bottom-[max(calc(var(--tabbar-h)+0.75rem),calc(env(safe-area-inset-bottom)+0.75rem))] z-40 flex items-center gap-3 rounded-xl border border-primary/20 bg-accent px-3.5 py-2.5 text-sm shadow-lg lg:hidden"
    >
      <Download aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 leading-snug">
        <strong className="font-semibold">Instala FacturaLibre</strong> en tu móvil y ábrela como una app.
      </p>
      <Button type="button" size="sm" onClick={start}>
        Instalar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="No mostrar más"
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, "1");
          notify();
        }}
      >
        <X aria-hidden="true" />
      </Button>
      {dialog}
    </aside>
  );
}
