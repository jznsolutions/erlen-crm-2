import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Kryptografisch sicherer Einladungstoken (256 Bit, URL-sicher). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** In der Datenbank wird ausschließlich der SHA-256-Hash gespeichert. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
