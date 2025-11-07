import { type OrderSide } from "../models/order.types";

export const getOppositeOrderSide = (side: OrderSide) => {
  return side === "BUY" ? "SELL" : "BUY";
};
