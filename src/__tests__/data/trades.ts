import { TradeHistoryCreationAttributes, TradeStatus } from "@/models/TradeHistory";
import { ExchangeName } from "@/types";

export const sampleTrade: TradeHistoryCreationAttributes = {
  id: "trade-12345",
  userId: "user-12345",
  token: "INIT",
  exchange: "extended/hyperliquid" as ExchangeName,
  status: TradeStatus.OPEN,
  side: "DELTA_NEUTRAL",
  size: 168.85302978202,
  price: 0.1184462015625,
  cost: 39.87887,

  autoCloseEnabled: false,
  autoCloseAPRThreshold: 0,
  autoClosePnLThreshold: 0,
  autoCloseTimeoutHours: 0,
};
