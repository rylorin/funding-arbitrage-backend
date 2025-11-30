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
}

export const exchangesRegistry = ExchangesRegistry;
