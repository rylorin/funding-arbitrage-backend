import { OrderlyExchange as Exchange, orderlyExchange as exchange } from "../../../exchanges/OrderlyExchange";
import { PositionSide } from "../../../models";
import { PlacedOrderData } from "../../../types";

describe("OrderlyExchange", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("orderly");
  });

  it("should have proper base class structure", () => {
    expect(exchange).toBeInstanceOf(Exchange);
  });

  test("Cancel Order", async () => {
    const sampleOrder: PlacedOrderData = {
      exchange: exchange.name,
      token: "SKY",
      side: PositionSide.LONG,
      size: 10,
      price: 0.1,
      leverage: 0,
      slippage: 0.1,
      orderId: "18447287790",
    };
    const result = await exchange.cancelOrder(sampleOrder);
  });
});
