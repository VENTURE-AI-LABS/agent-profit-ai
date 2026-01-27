export type ProofSourceKind =
  | "tweet"
  | "thread"
  | "repo"
  | "website"
  | "dashboard"
  | "article"
  | "video"
  | "paper"
  | "other";

export type ProofSource = {
  label: string;
  url: string;
  kind?: ProofSourceKind;
  excerpt?: string;
};

export type CaseStudyStatus = "verified" | "speculation";

export type CaseStudy = {
  id: string;
  date: string; // ISO 8601 date (YYYY-MM-DD)
  title: string;
  summary: string;
  description: string; // plain text; keep readable with newlines
  profitMechanisms: string[];
  tags: string[];
  proofSources: ProofSource[];
  status?: CaseStudyStatus;
};

