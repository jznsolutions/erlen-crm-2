export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-32 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-white/70 [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_a]:underline">{children}</div>
    </div>
  );
}

export function DraftNotice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">{children}</p>;
}
