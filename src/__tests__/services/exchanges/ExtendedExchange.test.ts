import { OrderData, OrderSide } from "../../../services/exchanges/ExchangeConnector";
import {
  ExtendedExchange as Exchange,
  extendedExchange as exchange,
} from "../../../services/exchanges/ExtendedExchange";

describe("ExtendedExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    await exchange.testConnection();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("extended");
  });

  it("should have proper base class structure", () => {
    expect(exchange).toBeInstanceOf(Exchange);
  });

  test("Place Order", async () => {
    const sampleOrder: OrderData = {
      token: "BTC",
      side: OrderSide.LONG,
      size: 1,
      price: 50_000,
    };
    const orderId = await exchange.openPosition(sampleOrder);
    expect(orderId).toBe("extended-order-123");
  });
});
