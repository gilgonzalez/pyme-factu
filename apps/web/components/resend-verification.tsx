"use client";
// Reenviar el correo de confirmación. La respuesta es la misma exista o no la cuenta (no revela qué emails están
// registrados): si hay una cuenta sin confirmar con ese email, le llega un enlace nuevo. Espera 60 s entre envíos
// (además del límite del servidor: 3 cada 15 minutos).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

export function ResendVerification({ email, callbackURL }: { readonly email: string; readonly callbackURL: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | { readonly error: string }>("idle");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
    if (error) {
      setState({ error: authErrorMessage(error.code, error.status) });
      return;
    }
    setState("sent");
    setWait(COOLDOWN_SECONDS);
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">¿No te llega? Revisa la carpeta de spam o pide otro enlace.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void resend()} disabled={state === "sending" || wait > 0}>
          {state === "sending" ? "Reenviando…" : wait > 0 ? `Reenviar de nuevo en ${String(wait)} s` : "Reenviar el correo de confirmación"}
        </Button>
        <p role="status" aria-live="polite" className="text-sm">
          {state === "sent" ? `Si hay una cuenta sin confirmar con ${email}, le hemos enviado un enlace nuevo.` : null}
          {typeof state === "object" ? <span className="text-destructive">{state.error}</span> : null}
        </p>
      </div>
    </div>
  );
}
