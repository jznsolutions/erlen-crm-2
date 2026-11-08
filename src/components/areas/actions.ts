"use server";
import { cookies } from "next/headers";
import { AREA_COOKIE } from "@/lib/area-shared";

/** Gewählten Bereich merken (ein Jahr, nur für dieses Gerät). */
export async function chooseArea(key: string) {
  if (!/^[a-z0-9_-]{2,40}$/.test(key)) return;
  (await cookies()).set(AREA_COOKIE, key, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}
