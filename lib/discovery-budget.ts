import { randomUUID } from "node:crypto";

export const MONTHLY_DISCOVERY_BUDGET_MICROS = 1_000_000;
// Peak DeepSeek V4 Pro rates (USD per million tokens, converted to micros),
// conservatively above Flash rates. Review if provider pricing changes:
// https://api-docs.deepseek.com/quick_start/pricing/
const INPUT_PRICE_MICROS_PER_MILLION_TOKENS = 1_320_000;
const OUTPUT_PRICE_MICROS_PER_MILLION_TOKENS = 3_960_000;
const INPUT_TOKEN_OVERHEAD = 300;

export type DiscoveryOperation = "evidence_enrichment" | "ranking";
export type DiscoveryRequestOutcome = "completed" | "invalid" | "failed";

export type DiscoveryProviderUsage = {
  inputTokens: number;
  outputTokens: number;
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

export function discoveryBudgetMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function estimateDiscoveryRequestMicros(input: {
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
    const alreadyReserved = this.monthlyUsage(input.month);
    if (input.estimatedMicros <= 0 || alreadyReserved + input.estimatedMicros > capMicros) return null;

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

  monthlyUsage(month: string) {
    return this.requests
      .filter((request) => request.month === month)
      .reduce((total, request) => total + request.estimatedMicros, 0);
  }
}
