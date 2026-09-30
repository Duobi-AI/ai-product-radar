import { randomUUID } from "node:crypto";

export const MONTHLY_DISCOVERY_BUDGET_MICROS = 1_000_000;
// Shared peak-rate ceiling applied to every discovery request. Peak DeepSeek
// V4 Pro rates (USD per million tokens, converted to micros) exceed the current
// default Gemini 2.5 Flash Lite and DeepSeek Flash rates. Keep configured ranking
// models on DeepSeek or that Gemini default; review if provider pricing changes:
// https://api-docs.deepseek.com/quick_start/pricing/
const INPUT_PRICE_MICROS_PER_MILLION_TOKENS = 1_320_000;
const OUTPUT_PRICE_MICROS_PER_MILLION_TOKENS = 3_960_000;
const INPUT_TOKEN_OVERHEAD = 300;

export type DiscoveryOperation = "evidence_enrichment" | "ranking";
export type DiscoveryRequestOutcome = "completed" | "invalid" | "failed";

export type DiscoveryProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type DiscoveryBudgetReservation = {
  id: string;
  month: string;
  operation: DiscoveryOperation;
  estimatedMicros: number;
};

export type DiscoveryBudgetRequest = DiscoveryBudgetReservation & {
  outcome: DiscoveryRequestOutcome | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type DiscoveryBudgetRepository = {
  reserve: (input: Omit<DiscoveryBudgetReservation, "id">) => Promise<DiscoveryBudgetReservation | null>;
  recordUsage: (
    reservation: DiscoveryBudgetReservation,
    input: { outcome: DiscoveryRequestOutcome; usage?: DiscoveryProviderUsage },
  ) => Promise<void>;
};

export async function recordDiscoveryBudgetUsage(
  budget: DiscoveryBudgetRepository,
  reservation: DiscoveryBudgetReservation | null,
  input: { outcome: DiscoveryRequestOutcome; usage?: DiscoveryProviderUsage },
) {
  if (!reservation) return;
  try {
    await budget.recordUsage(reservation, input);
  } catch {
    // The estimate remains reserved even if the provider usage receipt cannot be written.
  }
}

export function discoveryBudgetMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidDiscoveryReservationMicros(amount: number, capMicros = MONTHLY_DISCOVERY_BUDGET_MICROS) {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= capMicros;
}

export function estimateConservativeDiscoveryRequestMicros(input: {
  inputCharacters: number;
  maximumOutputTokens: number;
}) {
  const estimatedInputTokens = Math.ceil(Math.max(0, input.inputCharacters) / 3) + INPUT_TOKEN_OVERHEAD;
  const estimatedMicros = Math.ceil(
    (
      estimatedInputTokens * INPUT_PRICE_MICROS_PER_MILLION_TOKENS
      + Math.max(0, input.maximumOutputTokens) * OUTPUT_PRICE_MICROS_PER_MILLION_TOKENS
    ) / 1_000_000,
  );
  return Math.max(1, estimatedMicros);
}

export class InMemoryDiscoveryBudgetRepository implements DiscoveryBudgetRepository {
  readonly requests: DiscoveryBudgetRequest[] = [];

  constructor(private readonly options: { capMicros?: number } = {}) {}

  async reserve(input: Omit<DiscoveryBudgetReservation, "id">) {
    const capMicros = this.options.capMicros ?? MONTHLY_DISCOVERY_BUDGET_MICROS;
    const alreadyReserved = this.monthlyReservedMicros(input.month);
    if (!isValidDiscoveryReservationMicros(input.estimatedMicros, capMicros)
      || alreadyReserved + input.estimatedMicros > capMicros) return null;

    const reservation: DiscoveryBudgetRequest = {
      ...input,
      id: randomUUID(),
      outcome: null,
      inputTokens: null,
      outputTokens: null,
    };
    this.requests.push(reservation);
    return reservation;
  }

  async recordUsage(
    reservation: DiscoveryBudgetReservation,
    input: { outcome: DiscoveryRequestOutcome; usage?: DiscoveryProviderUsage },
  ) {
    const request = this.requests.find((candidate) => candidate.id === reservation.id);
    if (!request) throw new Error("Unknown discovery budget reservation");
    request.outcome = input.outcome;
    request.inputTokens = input.usage?.inputTokens ?? null;
    request.outputTokens = input.usage?.outputTokens ?? null;
  }

  monthlyReservedMicros(month: string) {
    return this.requests
      .filter((request) => request.month === month)
      .reduce((total, request) => total + request.estimatedMicros, 0);
  }
}
