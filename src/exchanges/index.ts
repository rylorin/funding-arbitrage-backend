import {
  asterPerpExchange,
  asterSpotExchange,
  extendedExchange,
  hyperliquidPerpExchange,
  hyperliquidSpotExchange,
  orderlyExchange,
  vestExchange,
} from "./";
import { ExchangeConnector, ExchangeName } from "./ExchangeConnector";

// Export types
export { ExchangeConnector };

// Export all exchange connectors
export { ApexPerpExchange, apexPerpExchange } from "./ApexPerpExchange";
export { ApexSpotExchange, apexSpotExchange } from "./ApexSpotExchange";
export { AsterPerpExchange, asterPerpExchange } from "./AsterPerpExchange";
export { AsterSpotExchange, asterSpotExchange } from "./AsterSpotExchange";
export { ExtendedExchange, extendedExchange } from "./ExtendedExchange";
export { HyperliquidExchange } from "./HyperliquidExchange";
export { HyperliquidPerpExchange, hyperliquidPerpExchange } from "./HyperliquidPerpExchange";
export { HyperliquidSpotExchange, hyperliquidSpotExchange } from "./HyperliquidSpotExchange";
export { OrderlyExchange, orderlyExchange } from "./OrderlyExchange";
export { VestExchange, vestExchange } from "./VestExchange";

export class ExchangesRegistry {
  private static readonly exchanges: ExchangeConnector[] = [];

  public static getExchange(name: ExchangeName): ExchangeConnector | null {
    const result = ExchangesRegistry.exchanges.find((ex) => ex.name === name);
    return result || null;
  }

  public static getAllExchanges(): ExchangeConnector[] {
    return ExchangesRegistry.exchanges;
  }

  public static registerExchange(exchange: ExchangeConnector): void {
    this.exchanges.push(exchange);
  }

  public static async init() {
    await [
      asterPerpExchange,
      asterSpotExchange,
      extendedExchange,
      hyperliquidPerpExchange,
      hyperliquidSpotExchange,
      orderlyExchange,
      vestExchange,
      // apexPerpExchange,
    ].reduce(async (p, exchange) => {
      p.then(async () => {
        if (exchange.isEnabled) {
          console.log(`🔗 Connecting to ${exchange.name} exchange...`);
          ExchangesRegistry.registerExchange(exchange);
          return exchange
            .testConnection()
            .then((count) => console.log(`✅ ${exchange.name} exchange connected: ${count} pairs available`));
        } else {
          console.log(`⚠️ ${exchange.name} exchange is disabled, skipping connection`);
          return Promise.resolve();
        }
      });
    }, Promise.resolve());
  }
}

export const exchangesRegistry = ExchangesRegistry;
