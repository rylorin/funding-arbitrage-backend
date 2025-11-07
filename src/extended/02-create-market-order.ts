import { getFees } from "./api/fees";
import { getMarket } from "./api/markets";
import { placeOrder } from "./api/order";
import { getStarknetDomain } from "./api/starknet";
import { init } from "./init";
import { Order } from "./models/order";
import { createOrderContext } from "./utils/create-order-context";
import { Decimal } from "./utils/number";
import { roundToMinChange } from "./utils/round-to-min-change";

const MARKET_NAME = "ETH-USD";
const SLIPPAGE = 0.0075;

const runExample = async () => {
  const { starkPrivateKey, vaultId } = await init();

  const market = await getMarket(MARKET_NAME);
  const fees = await getFees({ marketName: MARKET_NAME });
  const starknetDomain = await getStarknetDomain();

  const orderSize = market.tradingConfig.minOrderSize;
  const orderPrice = market.marketStats.askPrice.times(1 + SLIPPAGE);

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

  const result = await placeOrder({ order });

  console.log("Order placed: %o", result);
};

await runExample();
