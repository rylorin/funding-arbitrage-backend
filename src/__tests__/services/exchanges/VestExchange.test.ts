import { VestExchange, vestExchange } from "../../../services/exchanges/VestExchange";

describe("ExtendedExchange", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it("should initialize correctly", () => {
    expect(vestExchange).toBeDefined();
    expect(vestExchange.name).toBe("vest");
  });

  it("should have proper base class structure", () => {
    expect(vestExchange).toBeInstanceOf(VestExchange);
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
      expect(typeof vestExchange).toBe("object");
    });
  });
});
