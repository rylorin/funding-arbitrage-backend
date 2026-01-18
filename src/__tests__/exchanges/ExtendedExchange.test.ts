import {
  highPrecisionQuantityOrder,
  sampleOrder,
  samplePlacedOrder,
  sampleToken,
  shortOrder,
} from "@/__tests__/data/orders";
import { ExchangeType } from "@/exchanges/ExchangeConnector";
import { extendedExchange as exchange } from "@exchanges/ExtendedExchange";
import { getFees } from "@extended/api/fees";
import { getMarket } from "@extended/api/markets";
import { getStarknetDomain } from "@extended/api/starknet";
import { init } from "@extended/init";
import { Order } from "@extended/models//order";
import { createOrderContext } from "@extended/utils/create-order-context";
import { Decimal } from "@extended/utils/number";
import { roundToMinChange } from "@extended/utils/round-to-min-change";

// const TOKEN = "DOGE";
const MARKET_NAME = `${sampleToken}-USD`;
const SLIPPAGE = 0.1;

describe("ExtendedExchange", () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    await exchange.testConnection();
  });

  test("Native Place Order", async () => {
    const { starkPrivateKey, vaultId } = await init();

    const market = await getMarket(MARKET_NAME);
    const fees = await getFees({ marketName: MARKET_NAME });
    const starknetDomain = await getStarknetDomain();

    const orderSize = market.tradingConfig.minOrderSize;
    const orderPrice = market.marketStats.askPrice.times(1 + SLIPPAGE / 100);

    const ctx = createOrderContext({
      market,
      fees,
      starknetDomain,
      vaultId,
      starkPrivateKey,
    });
    const order = Order.create({
      marketName: MARKET_NAME,
      orderType: "MARKET",
      side: "BUY",
      amountOfSynthetic: roundToMinChange(orderSize, market.tradingConfig.minOrderSizeChange, Decimal.ROUND_DOWN),
      price: roundToMinChange(orderPrice, market.tradingConfig.minPriceChange, Decimal.ROUND_DOWN),
      timeInForce: "IOC",
      reduceOnly: false,
      postOnly: false,
      ctx,
    });

    //   const result = await placeOrder({ order });
    // expect(result).toBeDefined();

    //   console.debug("Order placed: %o", result);
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
    const result = await exchange.placeOrder(sampleOrder);
    console.debug(result);
    expect(result.orderId).toBeDefined();
    samplePlacedOrder.orderId = result.orderId;
    samplePlacedOrder.price = result.price;
    samplePlacedOrder.size = result.size;
  });

  test("Get orders", async () => {
    const result = await exchange.getAllOrders();
    const pos = result.filter((p) => p.token === sampleOrder.token && p.side === sampleOrder.side);
    // console.debug(result, pos);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].status).toBeDefined();
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
    const t = exchange.placeOrder(shortOrder).then((response) => response.orderId);
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
