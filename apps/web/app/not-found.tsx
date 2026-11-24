import Link from "next/link";
import { AuthShell } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";

// Misma respuesta para una organización inexistente y para una ajena: no se revela si existe.
export default function NotFound() {
  return (
    <AuthShell
      title="No hemos encontrado esta página"
      description="La dirección no existe o no tienes acceso a ella. Si te han invitado a una organización, usa el enlace del email."
    >
      <Link href="/organizaciones" className={buttonVariants({ size: "lg" })}>
        Ir a mis organizaciones
      </Link>
    </AuthShell>
  );
}
