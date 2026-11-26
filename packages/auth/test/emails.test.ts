import { describe, expect, it } from "vitest";
import { documentMessage, invitationMessage } from "../src";

describe("correo de invitación", () => {
  const message = invitationMessage({
    to: "nueva@example.test",
    inviterName: "Ana <script>alert(1)</script>",
    tenantName: 'Empresa "Alfa" & Cía',
    roleLabel: "Contable",
    url: "https://app.example.test/invitacion/abc?x=1&y=2",
  });

  it("nombra a quien invita, la organización y el rol", () => {
    expect(message.to).toBe("nueva@example.test");
    expect(message.subject).toBe('Ana <script>alert(1)</script> te invita a Empresa "Alfa" & Cía en FacturaLibre');
    expect(message.text).toContain("con el rol Contable");
    expect(message.text).toContain("https://app.example.test/invitacion/abc?x=1&y=2");
  });

  it("escapa en el HTML los datos introducidos por usuarios", () => {
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("Ana &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).toContain("Empresa &quot;Alfa&quot; &amp; Cía");
    expect(message.html).toContain('href="https://app.example.test/invitacion/abc?x=1&amp;y=2"');
  });
});

describe("correo con un borrador o una factura en PDF", () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const draft = documentMessage({
    to: "compras@cliente.test",
    senderName: "Ana <b>Ficticia</b>",
    title: "Borrador de factura",
    draft: true,
    total: "121,00 €",
    note: "Hola,\n¿te encaja <así>?",
    replyTo: "ana@ficticia.test",
    pdf: { filename: "borrador.pdf", content: pdf },
  });

  it("lo envía en nombre del emisor, con el importe y el PDF adjunto", () => {
    expect(draft.to).toBe("compras@cliente.test");
    expect(draft.replyTo).toBe("ana@ficticia.test");
    expect(draft.subject).toBe("Borrador de factura de Ana <b>Ficticia</b>");
    expect(draft.text).toContain("Hola,\n¿te encaja <así>?");
    expect(draft.text).toContain("Total: 121,00 €");
    expect(draft.attachments).toEqual([{ filename: "borrador.pdf", content: pdf, contentType: "application/pdf" }]);
  });

  it("deja claro que un borrador no es todavía una factura", () => {
    expect(draft.text).toContain("no tiene validez fiscal");
    const invoice = documentMessage({ to: "c@cliente.test", senderName: "Ana", title: "Factura F2026-0001", draft: false, total: "1,00 €", note: null, pdf: { filename: "F2026-0001.pdf", content: pdf } });
    expect(invoice.text).not.toContain("validez fiscal");
    expect(invoice.subject).toBe("Factura F2026-0001 de Ana");
    expect(invoice.replyTo).toBeUndefined();
  });

  it("escapa en el HTML lo que escribe el usuario y respeta sus saltos de línea", () => {
    expect(draft.html).not.toContain("<b>");
    expect(draft.html).toContain("Ana &lt;b&gt;Ficticia&lt;/b&gt;");
    expect(draft.html).toContain("Hola,<br>¿te encaja &lt;así&gt;?");
  });
});
