import type { Metadata } from "next";
import { streamedPage } from "@/components/form";
import { NewTemplatePage } from "../template-editor";

export const metadata: Metadata = { title: "Nueva plantilla" };

export default streamedPage("Preparando la plantilla…", NewTemplatePage, "frame");
