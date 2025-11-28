// API reference: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { createHmac } from "crypto";
import WebSocket from "ws";
import Position, { PositionSide, PositionStatus } from "../models/Position";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface AsterMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  contractSize: number;
  ticker: {
    lastPrice: string;
    bidPrice: string;
    askPrice: string;
    lastQuantity: string;
    volume: string;
    quoteVolume: string;
    priceChange: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    openPrice: string;
    closePrice: string;
  };
}

interface AsterFundingRate {
  symbol: string;
  fundingRate: string;
  nextFundingTime: number;
}

interface AsterAccountInfo {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: Array<{
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    maxWithdrawAmount: string;
  }>;
  positions: Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
    maxWithdrawAmount: string;
    marginType: string;
    isolatedMargin: string;
    isAutoAddMargin: string;
    positionSide: string;
    notional: string;
    isolatedWallet: string;
    updateTime: number;
  }>;
}

function calculateHmacSha256(data: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  return hmac.digest("hex");
}

export class AsterPerpExchange extends ExchangeConnector {
  private readonly secretKey: string;
  private readonly universe: Record<
    TokenSymbol,
    {
      symbol: string;
      pricePrecision: number;
      quantityPrecision: number;
    }
  > = {};

  constructor() {
    super("asterperp");
    this.secretKey = this.config.get<string>("secretKey");
  }

  public post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> {
    return super
      .post<T, R, D>(url, data, {
        transformRequest: [
          (data, headers) => {
            delete headers["Content-Type"];
            return data;
          },
        ],
        ...config,
      })
      .catch((reason) => {
        throw Error(reason.data.msg);
      });
  }

  private async getExchangeInfo(force: boolean = false): Promise<number> {
    if (force || !this.universe["BTC"]) {
      const response = await this.get("/fapi/v1/exchangeInfo").then((response) => response.data.symbols);
      response
        .filter((m: any) => m.contractType === "PERPETUAL" && m.status === "TRADING")
        .forEach((item: any) => (this.universe[this.tokenFromTicker(item.symbol)!] = item));
    }
    const count = Object.keys(this.universe).length;
    return count;
  }

  public async testConnection(): Promise<number> {
    try {
      const count = await this.getExchangeInfo(true);
      console.log(`✅ Aster Perp Exchange connected: ${count} perpetual markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Aster Perp Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    const token = symbol.replace("USDT", "").replace("BUSD", "").replace("USD", "");
    return token && token.length > 0 ? (token as TokenSymbol) : null;
  }

  // private extractTokensFromMarkets(marketsResponse: any[]): TokenSymbol[] {
  //   const tokens = marketsResponse
  //     .map((market) => this.tokenFromTicker(market.symbol))
  //     .filter((token) => token !== null);
  //   return tokens as TokenSymbol[];
  // }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}USDT`;
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all mark prices which contain funding rates
      const response = await this.get("/fapi/v1/premiumIndex", {
        params: { symbol: tokens && tokens.length === 1 ? this.tokenToTicker(tokens[0]) : undefined },
      });

      const markPrices = Array.isArray(response.data) ? response.data : [response.data];

      for (const markPrice of markPrices.filter((m) => m.symbol.endsWith("USDT"))) {
        try {
          const token = this.tokenFromTicker(markPrice.symbol);
          if (!token || (tokens && !tokens.includes(token))) continue;

          const nextFundingTime = markPrice.nextFundingTime || Date.now() + 8 * 60 * 60 * 1000;

          const rate: FundingRateData = {
            exchange: this.name,
            token,
            fundingRate: parseFloat(markPrice.lastFundingRate || markPrice.fundingRate || "0"),
            nextFunding: new Date(nextFundingTime),
            fundingFrequency: this.config.get("fundingFrequency"), // in hours
            updatedAt: new Date(),
            markPrice: parseFloat(markPrice.markPrice),
            indexPrice: parseFloat(markPrice.indexPrice),
          };
          //   if (token == "LTC") console.log(markPrice, rate);
          fundingRates.push(rate);
        } catch (error) {
          console.warn(`Failed to get funding rate for ${markPrice.symbol}:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Aster Perp funding rates:", error);
      throw new Error("Failed to fetch funding rates from Aster Perp");
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      const response = await this.get("/fapi/v2/account");
      const balances: { [token: string]: number } = {};

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          const amount = parseFloat(balance.walletBalance);
          if (amount > 0) {
            balances[balance.asset] = amount;
          }
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Aster Perp account balance:", error);
      throw new Error("Failed to fetch account balance from Aster Perp");
    }
  }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#change-initial-leverage-trade
  public async setLeverage(token: TokenSymbol, leverage: number): Promise<boolean> {
    const symbol = this.tokenToTicker(token);
    const payload = `symbol=${symbol}&leverage=${leverage}&timestamp=${Date.now()}`;
    const signature = calculateHmacSha256(payload, this.secretKey);
    const response = await this.post("/fapi/v1/leverage", `${payload}&signature=${signature}`).then(
      (response) => response.data,
    );
    // console.log(response);
    return response.symbol == symbol && response.leverage == leverage;
  }

  public async openPosition(order: OrderData, reduceOnly: boolean = false): Promise<PlacedOrderData> {
    const { token, side, size, leverage } = order;
    try {
      await this.getExchangeInfo();
      // console.log(this.universe[token]);

      const symbol = this.tokenToTicker(token);
      const sideParam = side === PositionSide.LONG ? "BUY" : "SELL";
      const quantity = size.toFixed(this.universe[token].quantityPrecision);

      if (leverage) this.setLeverage(token, leverage);

      const payload = `symbol=${symbol}&side=${sideParam}&type=MARKET&quantity=${quantity}&reduceOnly=${reduceOnly}&timestamp=${Date.now()}`;
      const signature = calculateHmacSha256(payload, this.secretKey);
      const response = await this.post("/fapi/v1/order", `${payload}&signature=${signature}`).then(
        (response) => response.data,
      );

      if (response.orderId) {
        return {
          ...order,
          orderId: response.orderId.toString(),
          size: parseFloat(response.origQty),
          price: parseFloat(response.avgPrice),
        };
      }

      throw new Error("Failed to open position");
    } catch (error) {
      console.error(`Error opening Aster Perp ${side} position for ${token}:`, error);
      throw error;
    }
  }

  public async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    const { token, orderId } = order;
    const symbol = this.tokenToTicker(token);

    const payload = `symbol=${symbol}&orderId=${orderId}&timestamp=${Date.now()}`;
    const signature = calculateHmacSha256(payload, this.secretKey);
    try {
      const response = await this.delete(`/fapi/v1/order?${payload}&signature=${signature}`).then(
        (response) => response.data,
      );
      console.log(response);
    } catch (error) {
      console.error(`${this.name}: failed to cancel order:`, error);
      return false;
    }
    return true;
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      const response = await this.get("/fapi/v2/positionRisk", {
        params: { symbol: positionId },
      });

      if (response.data.length > 0) {
        return parseFloat(response.data[0].unRealizedProfit);
      }

      return 0;
    } catch (error) {
      console.error(`Error fetching Aster Perp position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Aster Perp");
    }
  }

  public async getOrderHistory(symbol?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = this.tokenToTicker(symbol);

      const response = await this.get("/fapi/v1/allOrders", { params });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching Aster Perp order history:", error);
      throw new Error("Failed to fetch order history from Aster Perp");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Aster Perp WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Aster Perp WebSocket connected");

        // Subscribe to comprehensive market data streams
        const tradingPairs = [
          "BTCUSDT",
          "ETHUSDT",
          "SOLUSDT",
          "ADAUSDT",
          "DOGEUSDT",
          "MATICUSDT",
          "AVAXUSDT",
          "DOTUSDT",
          "LINKUSDT",
          "LTCUSDT",
          "UNIUSDT",
          "ATOMUSDT",
          "XRPUSDT",
          "FILUSDT",
          "TRXUSDT",
        ];

        const streamTypes = [
          "@ticker", // 24hr ticker statistics
          "@markPrice", // Mark price and funding rate
          "@bookTicker", // Best bid/ask price
          "@trade", // Individual trade updates
          "@kline_1m", // 1-minute candlesticks
          "@depth20@100ms", // Order book depth
        ];

        let streamId = 1;

        // Subscribe to each stream type for major pairs
        streamTypes.forEach((streamType) => {
          tradingPairs.forEach((pair) => {
            const streamName = `${pair.toLowerCase()}${streamType}`;
            const subscribeMessage = {
              method: "SUBSCRIBE",
              params: [streamName],
              id: streamId++,
            };

            console.log(`📡 Subscribing to ${streamName}`);
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        });

        // Subscribe to user data streams if authenticated
        if (this.config.has("apiKey") && this.config.has("secretKey")) {
          const userStreams = [
            {
              stream: "balanceAndPositionUpdate",
              description: "Balance and position updates",
            },
            {
              stream: "orderUpdate",
              description: "Order status updates",
            },
            {
              stream: "userDataStream",
              description: "General user data",
            },
          ];

          userStreams.forEach((userStream) => {
            const userSubscribeMessage = {
              method: "SUBSCRIBE",
              params: [userStream.stream],
              id: streamId++,
            };

            console.log(`📡 Subscribing to user stream: ${userStream.description}`);
            this.ws?.send(JSON.stringify(userSubscribeMessage));
          });
        }

        // Send ping every 30 seconds to maintain connection
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const pingMessage = {
              method: "ping",
              id: streamId++,
            };
            this.ws.send(JSON.stringify(pingMessage));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Aster Perp WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Aster Perp WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Aster Perp WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Aster Perp WebSocket disconnected:", { code, reason: reason.toString() });
        // Auto-reconnect after 5 seconds
        if (this.isConnected)
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Aster Perp WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
      });
    } catch (error) {
      console.error("Error connecting to Aster Perp WebSocket:", error);
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      const timestamp = Date.now();
      const payload = `timestamp=${timestamp}`;
      const signature = calculateHmacSha256(payload, this.secretKey);
      const response = await this.get(`/fapi/v2/positionRisk?${payload}&signature=${signature}`);
      const positions: Position[] = [];

      for (const pos of response.data) {
        if (parseFloat(pos.positionAmt) !== 0) {
          const token = this.tokenFromTicker(pos.symbol);
          if (token) {
            positions.push({
              id: pos.symbol,
              userId: "userId",
              tradeId: "tradeId",
              token,
              status: PositionStatus.OPEN,
              entryTimestamp: new Date(),

              exchange: this.name,
              side: parseFloat(pos.positionAmt) > 0 ? PositionSide.LONG : PositionSide.SHORT,
              size: Math.abs(parseFloat(pos.positionAmt)),
              price: parseFloat(pos.entryPrice),
              leverage: parseFloat(pos.leverage),
              slippage: 0,
              orderId: "orderId",

              cost: parseFloat(pos.notional),
              unrealizedPnL: parseFloat(pos.unRealizedProfit),
              realizedPnL: 0,

              updatedAt: new Date(),
              createdAt: new Date(),
            } as any);
          }
        }
      }

      return positions as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Aster Perp positions:", error);
      throw new Error("Failed to fetch positions from Aster Perp");
    }
  }
}

export const asterPerpExchange: AsterPerpExchange = new AsterPerpExchange();
export default asterPerpExchange;
