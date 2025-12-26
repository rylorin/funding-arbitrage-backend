import { ENDPOINTS, InfoType } from "@hyperliquid/constants";
import { SpotClearinghouseState, Tif } from "../hyperliquid/types";
import Position, { PositionSide, PositionStatus } from "../models/Position";
import { FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";
import { ExchangeName, ExchangeType } from "./ExchangeConnector";
import { HyperliquidExchange } from "./HyperliquidExchange";

export class HyperliquidSpotExchange extends HyperliquidExchange {
  constructor() {
    super("hyperliquid");
  }

  // Override type to SPOT for this exchange
  public get type(): ExchangeType {
    return ExchangeType.SPOT;
  }

  public get name(): ExchangeName {
    return "hyperliquidspot";
  }

  private async getSpotMeta(force: boolean = false): Promise<number> {
    if (force || Object.keys(this.universe).length === 0) {
      const response = await this.post<{ tokens: any[]; universe: any[] }>(ENDPOINTS.INFO, {
        type: InfoType.SPOT_META,
      }).then((response) => response.data);

      const tokensIndex: {
        name: string;
        index: number;
        szDecimals: number;
        // weiDecimals: number;
        // tokenId: string;
        // isCanonical: boolean;
      }[] = [];
      const usdc = response.tokens.find((t) => t.name === "USDC").index;

      // Process tokens
      response.tokens.forEach((token) => {
        tokensIndex[token.index] = {
          name: token.name,
          index: token.index,
          szDecimals: token.szDecimals,
          //   weiDecimals: token.weiDecimals,
          //   tokenId: token.tokenId,
          //   isCanonical: token.isCanonical,
        };
      });

      // Process markets
      response.universe
        .filter((item) => item.tokens[1] == this.universe["USDC"].index)
        .forEach((market) => {
          console.debug(market);
          const baseToken = tokensIndex[market.tokens[0]];
          this.universe[baseToken.name] = {
            index: market.index,
            name: baseToken.name,
            szDecimals: baseToken.szDecimals,
            maxLeverage: 1,
          };
        });
      console.debug("Hyperliquid Spot Universe:", this.universe);
    }

    return this.universe ? Object.keys(this.universe).length : 0;
  }

  public async getPrices(tokens?: TokenSymbol[]): Promise<{ [token: TokenSymbol]: number }> {
    try {
      const prices: { [token: string]: number } = {};

      const allMids = await this.post<{ [token: TokenSymbol]: string }>(ENDPOINTS.INFO, {
        type: InfoType.ALL_MIDS,
      }).then((response) => response.data);

      const tokensToProcess = tokens || (Object.keys(allMids) as TokenSymbol[]);

      for (const token of tokensToProcess) {
        if (allMids[token] !== undefined) {
          prices[token] = parseFloat(allMids[token]);
        }
      }

      return prices;
    } catch (error) {
      console.error(`Error fetching ${this.name} spot prices:`, error);
      throw new Error(`Failed to fetch spot prices from ${this.name}`);
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      if (!this.primaryAddress) {
        throw new Error("Hyperliquid spot balance requires primaryAddress configuration");
      }

      // Get spot clearinghouse state for balances
      const spotState = await this.post<SpotClearinghouseState>(ENDPOINTS.INFO, {
        type: InfoType.SPOT_CLEARINGHOUSE_STATE,
        user: this.primaryAddress,
      }).then((response) => response.data);
      // console.debug("Spot Clearinghouse State:", spotState);

      const balances: { [token: string]: number } = {};

      spotState.balances.forEach((balance) => {
        if (parseFloat(balance.total) > 0) {
          balances[balance.coin] = parseFloat(balance.total);
        }
      });

      return balances;
    } catch (error) {
      console.error(`Error fetching ${this.name} spot account balance:`, error);
      throw new Error(`Failed to fetch spot account balance from ${this.name}`);
    }
  }

  /**
   * Format price for spot markets (different decimal limits than perps)
   */
  protected formatPriceForHyperliquid(price: number, isPerp: boolean = false): string {
    return super.formatPriceForHyperliquid(price, isPerp);
  }

  /**
   * Place a new order on Hyperliquid spot exchange
   * Note: Spot trading doesn't use leverage, so this is simplified
   */
  public async openPosition(order: OrderData, reduce_only = false): Promise<PlacedOrderData> {
    const { token, side, size, slippage } = order;
    try {
      if (!this.wallet) {
        throw new Error("Hyperliquid spot position opening requires walletAddress and privateKey configuration");
      }

      //   await this.getMeta();
      await this.getSpotMeta();
      if (!this.universe[token]) {
        throw new Error(`Token ${token} not found in Hyperliquid spot universe`);
      }

      // Get current market price to calculate limit price with slippage
      const price = await this.getPrice(token);

      if (!price) {
        throw new Error(`Failed to get current price for ${token}`);
      }

      // Calculate limit price based on side and slippage
      const szDecimals = this.universe[token].szDecimals;
      const is_buy = side === PositionSide.LONG;
      const limitPrice = is_buy
        ? price * (1 + slippage / 100) // For buy, add slippage
        : price * (1 - slippage / 100); // For sell, subtract slippage
      const sz = size.toFixed(szDecimals);
      const limit_px = this.formatPriceForHyperliquid(limitPrice, false); // false for spot

      // Create order action for Hyperliquid spot
      const orderRequest = {
        coin: token, // asset/coin
        is_buy, // is buy
        sz, // size
        limit_px, // limit price
        order_type: { limit: { tif: "Gtc" as Tif } },
        reduce_only,
      };

      const response = await this.placeOrder(orderRequest);

      if (response.status != "ok") {
        throw new Error(JSON.stringify(response) || "Failed to place spot order");
      }
      if ("error" in response.response.data.statuses?.[0]) {
        throw new Error(response.response.data.statuses?.[0].error);
      }

      // Extract order ID from response
      const orderResult = response.response.data.statuses?.[0];
      const orderId = orderResult.filled?.oid || orderResult.resting.oid;

      console.log(`✅ Hyperliquid spot ${side} order ${reduce_only ? "closed" : "placed"} for ${token}: ${orderId}`);

      return {
        exchange: order.exchange,
        token: order.token,
        side: order.side,
        leverage: 0, // Spot trading doesn't use leverage
        slippage: order.slippage,

        orderId: orderId.toString(),
        price: limitPrice,
        size,
      };
    } catch (error) {
      console.error(`❌ Error placing Hyperliquid spot ${side} order for ${token}:`, error);
      throw error;
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Spot positions don't have PnL in the same way as perpetual positions
      // Return 0 as spot positions are just asset holdings
      return 0;
    } catch (error) {
      console.error(`Error fetching Hyperliquid spot position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch spot position PnL from Hyperliquid");
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      // For spot trading, we return the asset balances as "positions"
      if (!this.primaryAddress) {
        throw new Error("Hyperliquid spot positions require primaryAddress configuration");
      }

      const balances = await this.getAccountBalance();
      const positions: Position[] = [];

      // Convert balances to Position format
      for (const [token, balance] of Object.entries(balances)) {
        if (balance > 0) {
          const currentPrice = await this.getPrice(token as TokenSymbol);

          positions.push({
            id: `spot-${token}`,
            userId: "userId",
            tradeId: "tradeId",
            token: token as TokenSymbol,
            status: PositionStatus.OPEN,
            entryTimestamp: new Date(),
            exchange: this.name,
            side: PositionSide.LONG, // Spot holdings are always "long"
            size: balance,
            price: currentPrice,
            leverage: 0, // No leverage in spot trading
            slippage: 0,
            orderId: `spot-${token}`,
            cost: balance * currentPrice,
            unrealizedPnL: 0, // Spot positions don't have unrealized PnL
            realizedPnL: 0,
            updatedAt: new Date(),
            createdAt: new Date(),
          } as any); // Using 'any' to avoid type issues with Sequelize model
        }
      }

      return positions;
    } catch (error) {
      console.error("Error fetching Hyperliquid spot positions:", error);
      throw new Error("Failed to fetch spot positions from Hyperliquid");
    }
  }

  public async getOrderHistory(_symbol?: string, _limit: number = 100): Promise<any[]> {
    try {
      // Note: This requires user's wallet address for order history
      console.warn("Hyperliquid spot order history requires user wallet address authentication");
      return [];
    } catch (error) {
      console.error("Error fetching Hyperliquid spot order history:", error);
      throw new Error("Failed to fetch spot order history from Hyperliquid");
    }
  }

  // Override funding rates - spot markets don't have funding rates
  public async getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    const updatedAt = new Date();
    const nextFunding = new Date(2027, 0, 1); // Placeholder dates
    const prices = await this.getPrices();
    // Spot markets don't have funding rates
    return Object.entries(this.universe).map(([token, _data]) => ({
      exchange: this.name,
      token: token as TokenSymbol,
      fundingRate: 0,
      fundingFrequency: 24, // in hours
      nextFunding,
      markPrice: prices[token],
      updatedAt,
    }));
  }
}

export const hyperliquidSpotExchange = new HyperliquidSpotExchange();
export default hyperliquidSpotExchange;
