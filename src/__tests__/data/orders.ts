import { PositionSide } from "@/models";
import { ExchangeName, OrderData, PlacedOrderData, TokenSymbol } from "@/types";

export const sampleToken: TokenSymbol = "DOGE";

export const sampleOrder: OrderData = {
  exchange: "exchange.name" as ExchangeName,
  token: sampleToken,
  side: PositionSide.LONG,
  size: sampleToken == "DOGE" ? 70 : 0.00012,
  price: 0,
  leverage: 0,
  slippage: 0,
};

export const samplePlacedOrder: PlacedOrderData = {
  ...sampleOrder,
  orderId: "0123456789",
  price: 0.0123456789,
};

export const shortOrder: OrderData = {
  ...sampleOrder,
  side: PositionSide.SHORT,
};

export const highPrecisionQuantityOrder: OrderData = {
  ...sampleOrder,
  size: sampleToken == "DOGE" ? 70.01234567890123456789 : 0.0001201234567890123456789,
};
