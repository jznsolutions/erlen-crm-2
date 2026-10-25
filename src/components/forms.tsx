"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

export type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function SubmitButton({ children, pendingText = "Wird gespeichert …", ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? pendingText : children}
    </Button>
  );
}

/**
 * Formular mit Server Action: zeigt Fehler, Erfolgsmeldung (Toast) und
 * stellt Feldfehler über den Render-Prop bereit.
 */
export function ActionForm({
  action,
  children,
  className,
  successMessage,
  onSuccess,
  resetOnSuccess = false,
  redirectTo,
}: {
  action: FormAction;
  children: React.ReactNode | ((state: { fieldErrors: Record<string, string>; result: ActionResult | null }) => React.ReactNode);
  className?: string;
  successMessage?: string;
  onSuccess?: (result: ActionResult) => void;
  resetOnSuccess?: boolean;
  redirectTo?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const lastHandled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || lastHandled.current === state) return;
    lastHandled.current = state;
    if (state.ok) {
      toast.success(state.message ?? successMessage ?? "Gespeichert");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    }
  }, [state, successMessage, resetOnSuccess, onSuccess, redirectTo, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form ref={formRef} action={formAction} className={className} noValidate>
      {state && !state.ok ? <Alert tone="danger" className="mb-4">{state.error}</Alert> : null}
      {typeof children === "function" ? children({ fieldErrors, result: state }) : children}
    </form>
  );
}

/** Schaltfläche mit Bestätigungsdialog (optional mit Begründungsfeld). */
export function ConfirmAction({
  action,
  hidden,
  trigger,
  title,
  description,
  confirmLabel = "Bestätigen",
  tone = "default",
  reason,
}: {
  action: FormAction;
  hidden: Record<string, string>;
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "default" | "danger" | "success";
  reason?: { label: string; required?: boolean; placeholder?: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {reason ? (
            <Field label={reason.label + (reason.required ? " *" : "")} htmlFor="reason" className="mb-4">
              <Textarea id="reason" name="reason" required={reason.required} placeholder={reason.placeholder} maxLength={500} />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button>
            <SubmitButton variant={tone === "danger" ? "danger" : tone === "success" ? "success" : "default"} pendingText="Bitte warten …">
              {confirmLabel}
            </SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
