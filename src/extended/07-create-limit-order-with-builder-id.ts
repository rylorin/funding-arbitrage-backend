import { getFees } from "./api/fees";
import { getMarket } from "./api/markets";
import { placeOrder } from "./api/order";
import { getStarknetDomain } from "./api/starknet";
import { init } from "./init";
import { Order } from "./models/order";
import { createOrderContext } from "./utils/create-order-context";
import { invariant } from "./utils/invariant";
import { Decimal, Long } from "./utils/number";
import { roundToMinChange } from "./utils/round-to-min-change";

const MARKET_NAME = "ETH-USD";
const BUILDER_ID: Long | undefined = undefined; // Replace with your builder ID

const runExample = async () => {
  const { starkPrivateKey, vaultId } = await init();

  invariant(BUILDER_ID, "Builder ID is required");

  const market = await getMarket(MARKET_NAME);
  const fees = await getFees({ marketName: MARKET_NAME, builderId: BUILDER_ID });
  const starknetDomain = await getStarknetDomain();

  const orderSize = market.tradingConfig.minOrderSize;
  const orderPrice = market.marketStats.bidPrice.times(0.9);

  const ctx = createOrderContext({
    market,
    fees,
    starknetDomain,
    vaultId,
    starkPrivateKey,
    builderId: BUILDER_ID,
    builderFee: fees.builderFeeRate,
  });

  const order = Order.create({
    marketName: MARKET_NAME,
    orderType: "LIMIT",
    side: "BUY",
    amountOfSynthetic: roundToMinChange(orderSize, market.tradingConfig.minOrderSizeChange, Decimal.ROUND_DOWN),
    price: roundToMinChange(orderPrice, market.tradingConfig.minPriceChange, Decimal.ROUND_DOWN),
    timeInForce: "GTT",
    reduceOnly: false,
    postOnly: true,
    ctx,
  });

  const result = await placeOrder({ order });

  console.log("Order placed: %o", result);
};

await runExample();
