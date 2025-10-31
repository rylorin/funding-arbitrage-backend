import { ExchangeName } from "../../types/index";
import { ExchangeConnector } from "./ExchangeConnector";
import extendedExchange from "./ExtendedExchange";
import hyperliquidExchange from "./HyperliquidExchange";
import woofiExchange from "./OrderlyExchange";
import vestExchange from "./VestExchange";

// Export all exchange connectors
export { ExtendedExchange, extendedExchange } from "./ExtendedExchange";
export { HyperliquidExchange, hyperliquidExchange } from "./HyperliquidExchange";
export { WoofiExchange, woofiExchange } from "./OrderlyExchange";
export { VestExchange, vestExchange } from "./VestExchange";

// Export types
export type { ExchangeConnector } from "../../types/index";

export const exchanges: ExchangeConnector[] = [extendedExchange, hyperliquidExchange, vestExchange, woofiExchange];
// export const exchangesRegistry: Record<string, ExchangeConnector> = {
//   extended: extendedExchange,
//   hyperliquid: hyperliquidExchange,
//   vest: vestExchange,
//   orderly: woofiExchange,
// };
export const exchangesRegistry: Record<ExchangeName, ExchangeConnector> = exchanges.reduce(
  (p, item) => ({ ...p, [item.name]: item }),
  {} as Record<ExchangeName, ExchangeConnector>,
);
