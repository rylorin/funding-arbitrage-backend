import { sampleOrder, samplePlacedOrder } from "@/__tests__/data/orders";
import { getFees } from "@extended/api/fees";
import { getMarket } from "@extended/api/markets";
import { getStarknetDomain } from "@extended/api/starknet";
import { init } from "@extended/init";
import { Order } from "@extended/models//order";
import { createOrderContext } from "@extended/utils/create-order-context";
import { Decimal } from "@extended/utils/number";
import { roundToMinChange } from "@extended/utils/round-to-min-change";
import { extendedExchange as exchange } from "../../../exchanges/ExtendedExchange";

const TOKEN = "DOGE";
const MARKET_NAME = `${TOKEN}-USD`;
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
