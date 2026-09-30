import { eq, sql } from "drizzle-orm";
import { discoveryBudgetMonths, discoveryBudgetRequests } from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  isValidDiscoveryReservationMicros,
  MONTHLY_DISCOVERY_BUDGET_MICROS,
  type DiscoveryBudgetRepository,
} from "@/lib/discovery-budget";

type Database = NonNullable<ReturnType<typeof getDb>>;

export function createDrizzleDiscoveryBudgetRepository(db: Database): DiscoveryBudgetRepository {
  return {
    reserve: async (input) => {
      if (!isValidDiscoveryReservationMicros(input.estimatedMicros)) return null;
      const result = await db.execute(sql`
        WITH reserved AS (
          INSERT INTO ${discoveryBudgetMonths} (month, reserved_micros)
          VALUES (${input.month}, ${input.estimatedMicros})
          ON CONFLICT (month) DO UPDATE
          SET reserved_micros = ${discoveryBudgetMonths.reservedMicros} + ${input.estimatedMicros}, updated_at = now()
          WHERE ${discoveryBudgetMonths.reservedMicros} + ${input.estimatedMicros} <= ${MONTHLY_DISCOVERY_BUDGET_MICROS}
          RETURNING month
        ), logged AS (
          INSERT INTO ${discoveryBudgetRequests} (month, operation, estimated_micros)
          SELECT month, ${input.operation}, ${input.estimatedMicros} FROM reserved
          RETURNING id
        )
        SELECT id FROM logged
      `);
      const request = result.rows[0] as { id?: string } | undefined;
      return request?.id ? { ...input, id: request.id } : null;
    },
    recordUsage: async (reservation, input) => {
      await db.update(discoveryBudgetRequests).set({
        outcome: input.outcome,
        inputTokens: input.usage?.inputTokens ?? null,
        outputTokens: input.usage?.outputTokens ?? null,
      }).where(eq(discoveryBudgetRequests.id, reservation.id));
    },
  };
}
