import { ExchangeName } from "../../types/index";
import { ExchangeConnector } from "./ExchangeConnector";

// Export all exchange connectors
export { ExtendedExchange, extendedExchange } from "./ExtendedExchange";
export { HyperliquidExchange, hyperliquidExchange } from "./HyperliquidExchange";
export { OrderlyExchange, orderlyExchange } from "./OrderlyExchange";
export { VestExchange, vestExchange } from "./VestExchange";

// Export types
export { ExchangeConnector } from "../../types/index";

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
