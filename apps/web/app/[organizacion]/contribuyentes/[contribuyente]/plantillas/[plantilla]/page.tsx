import type { Metadata } from "next";
import { streamedPage } from "@/components/form";
import { EditTemplatePage } from "../template-editor";

export const metadata: Metadata = { title: "Editar plantilla" };

export default streamedPage("Cargando la plantilla…", EditTemplatePage, "frame");
