import type { Metadata } from "next";
import { authPage } from "@/components/form";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default authPage(
  "Crea tu cuenta",
  "Gratis. Después podrás crear tu organización o unirte a la que te invite.",
  SignUpForm,
);
