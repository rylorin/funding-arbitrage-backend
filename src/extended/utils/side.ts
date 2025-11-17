import { type PositionSide } from "../models/order.types";

export const getOppositeOrderSide = (side: PositionSide) => {
  return side === "BUY" ? "SELL" : "BUY";
};
