import { ExchangeConnector } from "./ExchangeConnector";
import extendedExchange from "./ExtendedExchange";
import hyperliquidExchange from "./HyperliquidExchange";
import vestExchange from "./VestExchange";
import woofiExchange from "./WoofiExchange";

// Export all exchange connectors
export { ExtendedExchange, extendedExchange } from "./ExtendedExchange";
export { HyperliquidExchange, hyperliquidExchange } from "./HyperliquidExchange";
export { VestExchange, vestExchange } from "./VestExchange";
export { WoofiExchange, woofiExchange } from "./WoofiExchange";

// Export types
export type { ExchangeConnector } from "../../types/index";

export const exchanges: ExchangeConnector[] = [extendedExchange, hyperliquidExchange, vestExchange, woofiExchange];
