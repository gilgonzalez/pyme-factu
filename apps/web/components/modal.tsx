"use client";
// Ventana modal accesible con <dialog> nativo (foco atrapado, Escape para cerrar, fondo inerte). Se monta en
// <body> con un portal. En móvil es una hoja que sube desde abajo, a todo el ancho: así su formulario nunca queda anidado dentro de otro formulario (p. ej. la factura).
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export function Modal({ title, description, onClose, children }: { readonly title: string; readonly description?: string; readonly onClose: () => void; readonly children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-[14px] border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40 max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
    >
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="grid gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={() => dialog.current?.close()}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>,
    document.body,
  );
}
