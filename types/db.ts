export type Profile = {
  id: string;
  display_name: string | null;
  phone: string | null;
  age_verified: boolean;
  credit_balance: number;
  created_at: string;
};

export type ConsentType =
  | "tos"
  | "privacy"
  | "sensitive_face"
  | "own_face"
  | "marketing";

export type Consent = {
  id: number;
  user_id: string;
  type: ConsentType;
  version: string;
  agreed_at: string;
  ip: string | null;
};

export type CreditLedgerReason =
  | "purchase"
  | "generation_hold"
  | "refund"
  | "release"
  | "signup_bonus";

export type CreditLedger = {
  id: number;
  user_id: string;
  delta: number;
  reason: CreditLedgerReason;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
};

export type OrderStatus = "PENDING" | "PAID" | "REFUNDED";

export type Order = {
  id: string;
  user_id: string;
  pack_id: string;
  expected_amount: number;
  credits: number;
  status: OrderStatus;
  payapp_mul_no: string | null;
  payapp_pay_state: string | null;
  payapp_pay_type: string | null;
  paid_at: string | null;
  created_at: string;
};

export type StyleFamily = "business" | "editorial" | "sns" | "fantasy" | "free";

export type StylePreset = {
  id: string;
  name_ko: string;
  family: StyleFamily;
  model_key: string;
  prompt_template: string;
  size: string;
  quality: string;
  credit_cost: number;
  is_active: boolean;
  sort_order: number;
};

export type JobStatus = "queued" | "processing" | "done" | "failed";

export type GenerationJob = {
  id: string;
  user_id: string;
  batch_id: string;
  style_preset_id: string;
  model_key: string;
  status: JobStatus;
  is_watermarked: boolean;
  hold_ledger_id: number | null;
  asset_id: string | null;
  error_code: string | null;
  created_at: string;
  finished_at: string | null;
};

export type AssetKind = "source_selfie" | "output" | "watermarked";

export type Asset = {
  id: string;
  job_id: string | null;
  user_id: string;
  storage_path: string;
  kind: AssetKind;
  width: number | null;
  height: number | null;
  mime: string;
  delete_after: string | null;
  created_at: string;
};

export type CreditPack = {
  id: string;
  name: string;
  price: number;
  credits: number;
};

/** Insert shape for generation_jobs (server-generated ids allowed; status defaults queued). */
export type NewJob = {
  id?: string;
  user_id: string;
  batch_id: string;
  style_preset_id: string;
  model_key: string;
  status?: JobStatus;
  is_watermarked?: boolean;
  hold_ledger_id?: number | null;
};
