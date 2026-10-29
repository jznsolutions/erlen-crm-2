import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("explainEmailError", () => {
  it("übersetzt typische Microsoft-Fehler in verständliche Hinweise", async () => {
    const { explainEmailError } = await import("@/lib/email");
    expect(explainEmailError("NOT_CONFIGURED")).toMatch(/Vercel/);
    expect(explainEmailError("MS_TOKEN 401 AADSTS7000215: Invalid client secret provided.")).toMatch(/„Wert“/);
    expect(explainEmailError("MS_TOKEN 400 AADSTS700016: Application not found")).toMatch(/MS_CLIENT_ID/);
    expect(explainEmailError("MS_GRAPH 403 ErrorAccessDenied Access is denied.")).toMatch(/Mail\.Send/);
    expect(explainEmailError("MS_GRAPH 404 ErrorInvalidUser")).toMatch(/EMAIL_FROM/);
    expect(explainEmailError("535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled")).toMatch(/Microsoft Graph/);
  });
});
