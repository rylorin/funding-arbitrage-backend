import { highPrecisionQuantityOrder, sampleOrder, samplePlacedOrder, shortOrder } from "@/__tests__/data/orders";
import { ExchangeType } from "@/exchanges/ExchangeConnector";
import { ApexPerpExchange as Exchange, apexPerpExchange as exchange } from "@exchanges/ApexPerpExchange";

describe("ApexPerpExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    // jest.spyOn(console, "log").mockImplementation(() => {});

    const count = await exchange.testConnection();
    // console.debug("Assets count:", count);
    // console.log("Assets count:", count);
    // console.warn("Assets count:", count);
    // console.error("Assets count:", count);
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("apexperp");
  });

  it("should have proper base class structure", () => {
    expect(exchange).toBeInstanceOf(Exchange);
  });

  test("Get funding rates", async () => {
    const result = await exchange.getFundingRates();
    console.debug(result);
    expect(result.length).toBeGreaterThan(0);
  });

  test("Get Price", async () => {
    const result = await exchange.getPrice(sampleOrder.token);
    console.debug(result);
    expect(result).toBeGreaterThan(0);
  });

  test("Set leverage", async () => {
    const t = exchange.setLeverage(sampleOrder.token, sampleOrder.leverage || 1);
    if (exchange.type == ExchangeType.PERP) {
      await expect(t).resolves.toBe(sampleOrder.leverage || 1);
    } else {
      try {
        await t;
        throw new Error("Expected exception but no exception was thrown");
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toContain("❌ Leverage setting not applicable for spot trading exchanges");
        } else {
          expect(error).toContain("❌ Leverage setting not applicable for spot trading exchanges");
        }
      }
    }
  });

  test("Open Position", async () => {
    const result = await exchange.placeOrder(sampleOrder);
    console.debug(result);
    expect(result.orderId).toBeDefined();
    samplePlacedOrder.orderId = result.orderId;
    samplePlacedOrder.price = result.price;
    samplePlacedOrder.size = result.size;
  });

  test("Get positions", async () => {
    const result = await exchange.getAllPositions();
    const pos = result.filter((p) => p.token === sampleOrder.token && p.side === sampleOrder.side);
    console.debug(result, pos);
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
    const placedOrder = await exchange.placeOrder(shortOrder);
    console.debug(placedOrder);
    expect(placedOrder.orderId).toBeDefined();
    await exchange.cancelOrder(placedOrder);
    const result = await exchange.closePosition(placedOrder);
    console.debug(result);
    expect(result).toBeDefined();
  });

  test("High precision quantity", async () => {
    const placedOrder = await exchange.placeOrder(highPrecisionQuantityOrder);
    console.debug(placedOrder);
    expect(placedOrder.orderId).toBeDefined();
    const canceled = await exchange.cancelOrder(placedOrder);
    if (!canceled) {
      const result = await exchange.closePosition(placedOrder);
      console.debug(result);
    }
  });
});
