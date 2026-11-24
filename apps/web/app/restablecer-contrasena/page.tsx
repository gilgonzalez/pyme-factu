import type { Metadata } from "next";
import { authPage } from "@/components/form";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default authPage(
  "Elige una contraseña nueva",
  "Al guardarla se cerrarán todas tus sesiones abiertas.",
  ResetPasswordForm,
);
