"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/entrar");
        router.refresh();
      }}
    >
      {/* En móvil, solo el icono; el texto sigue siendo el nombre accesible. */}
      <LogOut aria-hidden="true" className="sm:hidden" />
      <span className="max-sm:sr-only">{pending ? "Cerrando sesión…" : "Cerrar sesión"}</span>
    </Button>
  );
}
