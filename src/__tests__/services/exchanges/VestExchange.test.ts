import { OrderData, PositionSide } from "../../../services/exchanges/ExchangeConnector";
import { VestExchange as Exchange, vestExchange as exchange } from "../../../services/exchanges/VestExchange";

const TOKEN = "DOGE";

describe("VestExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    await exchange.testConnection();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("vest");
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
      size: 10,
      price: 0.1,
      leverage: 0,
      slippage: 0.1,
    };
    // const orderId = await exchange.openPosition(sampleOrder);
    // expect(orderId).toBe("extended-order-123");
  });
});
