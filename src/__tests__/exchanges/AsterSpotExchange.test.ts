import { highPrecisionQuantityOrder, sampleOrder, samplePlacedOrder, shortOrder } from "@/__tests__/data/orders";
import { ExchangeType } from "@/exchanges/ExchangeConnector";
import { AsterSpotExchange as Exchange, asterSpotExchange as exchange } from "@exchanges/AsterSpotExchange";

const TOKEN = "DOGE";

describe("AsterSpotExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    // jest.spyOn(console, "log").mockImplementation(() => {});

    await exchange.testConnection();
  });

  it("should initialize correctly", () => {
    expect(exchange).toBeDefined();
    expect(exchange.name).toBe("asterspot");
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

  test("Open position", async () => {
    const result = await exchange.openPosition(sampleOrder);
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

  test("Cancel order", async () => {
    const result = await exchange.cancelOrder(samplePlacedOrder);
    console.debug(result);
  });

  test("Close position", async () => {
    const result = await exchange.closePosition(samplePlacedOrder);
    console.debug(result);
    expect(result).toBeDefined();
  });

  test("Short position", async () => {
    const t = exchange.openPosition(shortOrder).then((response) => response.orderId);
    if (exchange.type == ExchangeType.PERP) {
      await expect(t).resolves.toBeDefined();
    } else {
      try {
        await t;
        throw new Error("Expected exception but no exception was thrown");
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toContain("❌ Short positions not applicable on spot trading exchanges");
        } else {
          expect(error).toContain("❌ Short positions not applicable on spot trading exchanges");
        }
      }
    }
  });

  test("High precision quantity", async () => {
    const placedOrder = await exchange.openPosition(highPrecisionQuantityOrder);
    console.debug(placedOrder);
    expect(placedOrder.orderId).toBeDefined();
    const canceled = await exchange.cancelOrder(placedOrder);
    if (!canceled) {
      const result = await exchange.closePosition(placedOrder);
      console.debug(result);
    }
  });
});
