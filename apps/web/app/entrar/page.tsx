import type { Metadata } from "next";
import { authPage } from "@/components/form";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default authPage(
  "Inicia sesión",
  "Accede a tus organizaciones y a tu facturación.",
  SignInForm,
);
