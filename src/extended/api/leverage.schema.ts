import { z } from "zod/v4";

const LeverageSchema = z.object({
  market: z.string(),
  leverage: z.number(),
});

export const LeverageResponseSchema = z.object({ data: LeverageSchema });
