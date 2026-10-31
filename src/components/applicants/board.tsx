"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Mail, Phone, Sparkles, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/forms";
import { ApplicantForm } from "@/components/applicant-form";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { APPLICANT_LABELS, APPLICANT_STATUSES, type ApplicantStatus } from "@/lib/applicants";
import { deleteApplicant, moveApplicant } from "@/app/(portal)/bewerber/actions";

export type BoardApplicant = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  message: string | null;
  source: string;
  status: ApplicantStatus;
  notes: string | null;
  created_at: string;
  next_booking: string | null;
  referred_by_name?: string | null;
};

const COLUMN_TONE: Record<ApplicantStatus, string> = {
  neu: "border-t-info",
  kontaktiert: "border-t-warning",
  gespraech: "border-t-warning",
  probetag: "border-t-primary",
  angenommen: "border-t-success",
  abgelehnt: "border-t-muted-foreground/40",
};

export function ApplicantBoard({ applicants, canManage, canInvite }: { applicants: BoardApplicant[]; canManage: boolean; canInvite: boolean }) {
  const [items, setOptimistic] = useOptimistic(applicants, (state, move: { id: string; status: ApplicantStatus }) =>
    state.map((a) => (a.id === move.id ? { ...a, status: move.status } : a)),
  );
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ApplicantStatus | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((a) => a.id === openId) ?? null;

  const move = (id: string, status: ApplicantStatus) => {
    const current = items.find((a) => a.id === id);
    if (!current || current.status === status) return;
    start(async () => {
      setOptimistic({ id, status });
      const r = await moveApplicant(id, status);
      if (r.ok) toast.success(`${current.full_name} → ${APPLICANT_LABELS[status]}`);
      else toast.error(r.error);
    });
  };
  const step = (a: BoardApplicant, dir: -1 | 1) => {
    const i = APPLICANT_STATUSES.indexOf(a.status) + dir;
    if (i >= 0 && i < APPLICANT_STATUSES.length) move(a.id, APPLICANT_STATUSES[i]);
  };

  return (
    <>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-6 xl:overflow-visible" data-testid="applicant-board">
        {APPLICANT_STATUSES.map((col) => {
          const list = items.filter((a) => a.status === col);
          return (
            <section
              key={col}
              aria-label={APPLICANT_LABELS[col]}
              data-column={col}
              onDragOver={(e) => {
                if (!canManage || !dragId) return;
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, col);
                setDragId(null);
                setOver(null);
              }}
              className={cn(
                "flex w-[78vw] max-w-[18rem] shrink-0 snap-start flex-col rounded-2xl border border-t-2 bg-card/60 sm:w-64 xl:w-auto xl:min-w-0 xl:max-w-none",
                COLUMN_TONE[col],
                over === col && "ring-2 ring-ring",
              )}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-sm font-semibold">{APPLICANT_LABELS[col]}</h2>
                <Badge>{list.length}</Badge>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {list.map((a) => (
                  <li
                    key={a.id}
                    draggable={canManage}
                    onDragStart={() => setDragId(a.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    className={cn("rounded-xl border bg-popover p-3 shadow-sm", canManage && "cursor-grab active:cursor-grabbing", dragId === a.id && "opacity-50")}
                    data-testid="applicant-card"
                  >
                    <button type="button" className="block w-full text-left" onClick={() => setOpenId(a.id)}>
                      <p className="truncate font-medium">{a.full_name}</p>
                      <p className="text-xs text-muted-foreground">Eingang {formatDateTime(a.created_at)}</p>
                      {a.next_booking ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-info"><CalendarClock className="size-3.5" />Termin {formatDateTime(a.next_booking)}</p>
                      ) : null}
                      {a.referred_by_name ? <p className="mt-1 flex items-center gap-1 text-xs text-[#c084fc]"><Sparkles className="size-3.5" />Empfohlen von {a.referred_by_name}</p> : null}
                      {a.notes ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.notes}</p> : null}
                    </button>
                    <div className="mt-2 flex items-center gap-1">
                      <a href={`tel:${a.phone}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={`${a.full_name} anrufen`}><Phone className="size-3.5" /></a>
                      <a href={`mailto:${a.email}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={`E-Mail an ${a.full_name}`}><Mail className="size-3.5" /></a>
                      {canManage ? (
                        <span className="ml-auto flex gap-1">
                          <Button size="icon-sm" variant="ghost" disabled={col === APPLICANT_STATUSES[0]} onClick={() => step(a, -1)} aria-label={`${a.full_name} zurück`}><ChevronLeft /></Button>
                          <Button size="icon-sm" variant="ghost" disabled={col === APPLICANT_STATUSES.at(-1)} onClick={() => step(a, 1)} aria-label={`${a.full_name} weiter`}><ChevronRight /></Button>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)}>
        {open ? (
          <DialogContent title={open.full_name} description={`Eingang ${formatDateTime(open.created_at)} · Quelle: ${open.source}`}>
            <div className="space-y-4 text-sm">
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <a className="inline-flex items-center gap-1.5 hover:underline" href={`mailto:${open.email}`}><Mail className="size-3.5" />{open.email}</a>
                <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${open.phone}`}><Phone className="size-3.5" />{open.phone}</a>
              </p>
              {open.referred_by_name ? <p className="flex items-center gap-1.5 text-[#c084fc]"><Sparkles className="size-4" />Empfohlen von {open.referred_by_name} – wird beim Einladen als „geworben von“ übernommen</p> : null}
              {open.next_booking ? <p className="flex items-center gap-1.5 text-info"><CalendarClock className="size-4" />Gesprächstermin {formatDateTime(open.next_booking)} · <Link className="underline" href="/termine">Termine</Link></p> : null}
              {open.message ? <p className="whitespace-pre-line rounded-md bg-muted p-3">{open.message}</p> : null}
              {canManage ? <ApplicantForm key={`${open.id}-${open.status}`} id={open.id} status={open.status} notes={open.notes} onSaved={() => setOpenId(null)} /> : open.notes ? <p className="text-muted-foreground">{open.notes}</p> : null}
              {canManage ? (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {canInvite ? <Button asChild size="sm"><Link href={`/admin/benutzer?bewerber=${open.id}`}><UserPlus />Ins Portal einladen</Link></Button> : null}
                  <ConfirmAction action={deleteApplicant} hidden={{ id: open.id }} title="Bewerbung löschen?" description="Die Daten werden endgültig entfernt." confirmLabel="Löschen" tone="danger" trigger={<Button size="sm" variant="ghost"><Trash2 />Löschen</Button>} />
                </div>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
