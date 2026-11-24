import { describe, expect, it } from "vitest";
import { invitationMessage } from "../src";

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
