import { PositionSide } from "@/models";
import { ExchangeName, OrderData, PlacedOrderData, TokenSymbol } from "@/types";

export const sampleToken: TokenSymbol = "DOGE";

export const sampleOrder: OrderData = {
  exchange: "exchange.name" as ExchangeName,
  token: sampleToken,
  side: PositionSide.LONG,
  size: 1,
  price: 0,
  leverage: 0,
  slippage: 0.3,
};

export const samplePlacedOrder: PlacedOrderData = {
  ...sampleOrder,
  orderId: "0123456789",
  price: 0.0123456789,
};
