"use client"

import * as React from "react"
import { cn } from "cn"

const OPTIONAL = " (opcional)"

/**
 * Etiqueta de campo. Si el texto acaba en « (opcional)», lo muestra como una marca discreta a la derecha;
 * el nombre accesible sigue siendo el mismo («Teléfono (opcional)»): los paréntesis solo los oye el lector.
 */
function Label({ className, children, ...props }: React.ComponentProps<"label">) {
  const optional = typeof children === "string" && children.endsWith(OPTIONAL)
  return (
    <label
      data-slot="label"
      className={cn(
        "flex h-4 items-center gap-2 text-[0.8125rem] leading-none font-semibold text-foreground/90 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {optional ? (
        <>
          {children.slice(0, -OPTIONAL.length)}
          <span className="ml-auto text-xs leading-none font-normal text-muted-foreground">
            <span className="sr-only"> (</span>opcional<span className="sr-only">)</span>
          </span>
        </>
      ) : (
        children
      )}
    </label>
  )
}

export { Label }
