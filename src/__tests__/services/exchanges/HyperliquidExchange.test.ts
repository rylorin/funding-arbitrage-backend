import {
  HyperliquidExchange as Exchange,
  hyperliquidExchange as exchange,
} from "../../../exchanges/HyperliquidExchange";
import { PositionSide } from "../../../models";
import { OrderData } from "../../../types";

const TOKEN = "DOGE";

describe("HyperliquidExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});

    await exchange.testConnection();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("hyperliquid");
  });

  it("should have proper base class structure", () => {
    expect(exchange).toBeInstanceOf(Exchange);
  });

  test("Set leverage", async () => {
    const result = await exchange.setLeverage(TOKEN, 1);
    expect(result).toBeDefined();
  });

  test("Place Order", async () => {
    const sampleOrder: OrderData = {
      exchange: exchange.name,
      token: TOKEN,
      side: PositionSide.LONG,
      size: 100,
      price: 0.12345678,
      leverage: 0,
      slippage: 0,
    };
    const result = await exchange.openPosition(sampleOrder);
    expect(result.orderId).toBeDefined();
  });
});
