import { z } from "zod/v4";

import { zodDecimal, zodLong } from "../utils/zod";

const UserPositionSchema = z.object({
  id: zodLong(),
  accountId: zodLong(),
  market: z.string(),
  status: z.enum(["OPENED"]),
  side: z.enum(["LONG", "SHORT"]),
  leverage: zodLong(),
  size: zodDecimal(),
  value: zodDecimal(),
  openPrice: zodDecimal(),
  markPrice: zodDecimal(),
  liquidationPrice: zodDecimal(),
  margin: zodDecimal(),
  unrealisedPnl: zodDecimal(),
  midPriceUnrealisedPnl: zodDecimal(),
  realisedPnl: zodDecimal(),
  tpTriggerPrice: zodDecimal().optional(),
  tpLimitPrice: zodDecimal().optional(),
  slTriggerPrice: zodDecimal().optional(),
  slLimitPrice: zodDecimal().optional(),
  maxPositionSize: zodDecimal().optional(),
  adl: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const UserPositionsResponseSchema = z.object({ data: UserPositionSchema.array() });
