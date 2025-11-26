import { sampleOrder, samplePlacedOrder } from "@/__tests__/data/orders";
import { AsterPerpExchange as Exchange, asterPerpExchange as exchange } from "../../../exchanges/AsterPerpExchange";

const TOKEN = "DOGE";

describe("AsterPerpExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});

    await exchange.testConnection();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("asterperp");
  });

  it("should have proper base class structure", () => {
    expect(exchange).toBeInstanceOf(Exchange);
  });

  test("Get Price", async () => {
    const result = await exchange.getPrice(sampleOrder.token);
    console.debug(result);
    expect(result).toBeGreaterThan(0);
  });

  test("Set leverage", async () => {
    const result = await exchange.setLeverage(sampleOrder.token, 1);
    console.debug(result);
    expect(result).toBeDefined();
  });

  test("Place Order", async () => {
    const result = await exchange.openPosition(sampleOrder);
    console.debug(result);
    expect(result.orderId).toBeDefined();
    samplePlacedOrder.orderId = result.orderId;
    samplePlacedOrder.price = result.price;
  });

  test("Cancel Order", async () => {
    const result = await exchange.cancelOrder(samplePlacedOrder);
    console.debug(result);
  });

  test("Get Positions", async () => {
    const result = await exchange.getAllPositions();
    console.debug(result);
    // expect(result.orderId).toBeDefined();
  });
});
