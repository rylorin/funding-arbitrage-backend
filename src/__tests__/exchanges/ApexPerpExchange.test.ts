import { highPrecisionQuantityOrder, sampleOrder, samplePlacedOrder, shortOrder } from "@/__tests__/data/orders";
import { ApexPerpExchange as Exchange, apexPerpExchange as exchange } from "@exchanges/ApexPerpExchange";

const TOKEN = "DOGE";

describe("ApexPerpExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    // jest.spyOn(console, "log").mockImplementation(() => {});

    await exchange.testConnection();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("apexperp");
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
    expect(result).toBe(true);
  });

  test("Open Position", async () => {
    const result = await exchange.openPosition(sampleOrder);
    console.debug(result);
    expect(result.orderId).toBeDefined();
    samplePlacedOrder.orderId = result.orderId;
    samplePlacedOrder.price = result.price;
    samplePlacedOrder.size = result.size;
  });

  test("Get Positions", async () => {
    const result = await exchange.getAllPositions();
    console.debug(result);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test("Cancel Order", async () => {
    const result = await exchange.cancelOrder(samplePlacedOrder);
    console.debug(result);
  });

  test("Close Position", async () => {
    const result = await exchange.closePosition(samplePlacedOrder);
    console.debug(result);
    expect(result).toBeDefined();
  });

  test("Short Position", async () => {
    const placedOrder = await exchange.openPosition(shortOrder);
    console.debug(placedOrder);
    expect(placedOrder.orderId).toBeDefined();
    await exchange.cancelOrder(placedOrder);
    const result = await exchange.closePosition(placedOrder);
    console.debug(result);
    expect(result).toBeDefined();
  });

  test("High precision quantity", async () => {
    const placedOrder = await exchange.openPosition(highPrecisionQuantityOrder);
    console.debug(placedOrder);
    expect(placedOrder.orderId).toBeDefined();
    await exchange.cancelOrder(placedOrder);
    const result = await exchange.closePosition(placedOrder);
    console.debug(result);
    expect(result).toBeDefined();
  });
});
