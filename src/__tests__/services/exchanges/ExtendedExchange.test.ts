import { getFees } from "@extended/api/fees";
import { getMarket } from "@extended/api/markets";
import { getStarknetDomain } from "@extended/api/starknet";
import { init } from "@extended/init";
import { Order } from "@extended/models//order";
import { createOrderContext } from "@extended/utils/create-order-context";
import { Decimal } from "@extended/utils/number";
import { roundToMinChange } from "@extended/utils/round-to-min-change";
import { OrderData, OrderSide } from "../../../services/exchanges/ExchangeConnector";
import { extendedExchange as exchange } from "../../../services/exchanges/ExtendedExchange";

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

    //   console.log("Order placed: %o", result);
  });

  test("Set leverage", async () => {
    const result = await exchange.setLeverage(TOKEN, 1);
    expect(result).toBeDefined();
  });

  test("Place Order", async () => {
    const sampleOrder: OrderData = {
      exchange: exchange.name,
      token: TOKEN,
      side: OrderSide.LONG,
      size: 100,
      price: 0.075,
      leverage: 0,
      slippage: SLIPPAGE,
    };
    // const result = await exchange.openPosition(sampleOrder);
    // expect(result).toBeDefined();
  });
});
