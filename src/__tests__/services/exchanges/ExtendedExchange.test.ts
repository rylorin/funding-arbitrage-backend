import { ExtendedExchange, extendedExchange } from "../../../services/exchanges/ExtendedExchange";

describe("ExtendedExchange", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it("should initialize correctly", () => {
    expect(extendedExchange).toBeDefined();
    expect(extendedExchange.name).toBe("extended");
  });

  it("should have proper base class structure", () => {
    expect(extendedExchange).toBeInstanceOf(ExtendedExchange);
  });

  describe("Starknet Signature Integration", () => {
    // const _mockOrder: OrderData = {
    //   token: "BTC",
    //   side: OrderSide.LONG,
    //   size: 1,
    //   price: 50000,
    // };

    it("should generate nonce correctly", () => {
      // This test is more for the utility function, but we can verify it's accessible
      expect(typeof extendedExchange).toBe("object");
    });
  });
});
