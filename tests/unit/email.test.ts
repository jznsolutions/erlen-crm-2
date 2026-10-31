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

describe("Absender und Antwortadresse (Microsoft 365)", () => {
  it("setzt Anzeigename, Absender-Postfach und allgemeine Antwortadresse", async () => {
    vi.stubEnv("MS_TENANT_ID", "t");
    vi.stubEnv("MS_CLIENT_ID", "c");
    vi.stubEnv("MS_CLIENT_SECRET", "s");
    vi.stubEnv("EMAIL_FROM", '"ERLEN Vertriebsagentur" <portal@erlen-sales.de>');
    vi.stubEnv("EMAIL_REPLY_TO", "kontakt@erlen-sales.de");
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string | URLSearchParams }) => {
      calls.push({ url, body: String(init.body) });
      if (url.includes("login.microsoftonline.com")) return new Response(JSON.stringify({ access_token: "x", expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: 202 });
    }));
    const { sendEmailResult, senderInfo } = await import("@/lib/email");
    expect(senderInfo()).toMatchObject({ name: "ERLEN Vertriebsagentur", address: "portal@erlen-sales.de", replyTo: "kontakt@erlen-sales.de" });
    expect(await sendEmailResult({ to: "a@example.com", subject: "Hi", text: "x" })).toEqual({ ok: true });
    const send = calls.find((c) => c.url.includes("/sendMail"))!;
    expect(send.url).toContain("/users/portal%40erlen-sales.de/sendMail");
    const message = JSON.parse(send.body).message;
    expect(message.from).toEqual({ emailAddress: { name: "ERLEN Vertriebsagentur", address: "portal@erlen-sales.de" } });
    expect(message.replyTo).toEqual([{ emailAddress: { address: "kontakt@erlen-sales.de" } }]);
    // Eine eigene Antwortadresse der Nachricht (z. B. Bewerber) hat Vorrang
    await sendEmailResult({ to: "kontakt@erlen-sales.de", subject: "Neue Bewerbung", text: "x", replyTo: "bewerber@example.com" });
    expect(JSON.parse(calls.filter((c) => c.url.includes("/sendMail")).at(-1)!.body).message.replyTo[0].emailAddress.address).toBe("bewerber@example.com");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
