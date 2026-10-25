import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: { default: "ERLEN Portal", template: "%s · ERLEN Portal" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[#0b0f1a] px-4 py-10">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(11,15,26,0.4), rgba(11,15,26,0.97)), url(/login-bg.jpg)" }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/erlen-logo.png" alt="ERLEN Vertriebsagentur" width={200} height={56} priority />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-white/40">Internes Portal · Zugang nur für eingeladene Mitarbeiter</p>
      </div>
    </div>
  );
}
