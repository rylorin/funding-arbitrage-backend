import { ExchangeConnector, OrderSide } from "../../../services/exchanges/ExchangeConnector";
import { TokenSymbol } from "../../../types/index";

// Mock implementation for testing
class MockExchange extends ExchangeConnector {
  constructor() {
    super("mock");
  }
}

describe("ExchangeConnector", () => {
  let mockExchange: MockExchange;

  beforeEach(() => {
    mockExchange = new MockExchange();
  });

  it("should initialize with correct name", () => {
    expect(mockExchange.name).toBe("mock");
  });

  it("should initialize with default values", () => {
    expect(mockExchange.isEnabled).toBe(true);
    expect(mockExchange.isConnected).toBe(false);
  });

  it("should have abstract methods that throw when called", () => {
    expect(() => {
      mockExchange.getFundingRates();
    }).toThrow();

    expect(() => {
      mockExchange.getAccountBalance();
    }).toThrow();

    expect(() => {
      mockExchange.openPosition({ token: "BTC" as TokenSymbol, side: OrderSide.LONG, size: 1, price: 50000 });
    }).toThrow();

    expect(() => {
      mockExchange.closePosition("123");
    }).toThrow();

    expect(() => {
      mockExchange.getPositionPnL("123");
    }).toThrow();
  });

  it("should have proper base class structure", () => {
    expect(mockExchange).toBeInstanceOf(ExchangeConnector);
  });
});
