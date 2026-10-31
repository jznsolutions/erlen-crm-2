export const APPLICANT_STATUSES = ["neu", "kontaktiert", "gespraech", "probetag", "angenommen", "abgelehnt"] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const APPLICANT_LABELS: Record<ApplicantStatus, string> = {
  neu: "Neu",
  kontaktiert: "Kontaktiert",
  gespraech: "Gespräch",
  probetag: "Probetag",
  angenommen: "Eingestellt",
  abgelehnt: "Abgelehnt",
};
