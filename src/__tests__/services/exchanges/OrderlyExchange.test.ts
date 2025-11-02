import { OrderlyExchange as Exchange, orderlyExchange as exchange } from "../../../services/exchanges/OrderlyExchange";

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
});
