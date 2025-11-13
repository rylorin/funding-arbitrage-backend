// https://docs.vestmarkets.com/vest-api
import { generateOrderSignature } from "@/utils/vest";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, TokenSymbol } from "../../types/index";
import { OrderData, OrderSide, PlacedOrderData } from "./ExchangeConnector";

type TokenInfo = {
  symbol: string;
  displayName: string;
  base: TokenSymbol;
  quote: TokenSymbol;
  sizeDecimals: number;
  priceDecimals: number;
  initMarginRatio: number;
  maintMarginRatio: number;
  takerFee: number;
  isolated: boolean;
};

export class VestExchange extends ExchangeConnector {
  private ws: WebSocket | null = null;

  constructor() {
    super("vest");

    // this.axiosClient.interceptors.request.use((config) => {
    //   if (config.data || config.method === "get") {
    //     config.headers = config.headers || {};
    //     (config.headers as any)["X-API-KEY"] = this.config.get("apiKey");
    //   }
    //   return config;
    // });
  }

  public async testConnection(): Promise<number> {
    try {
      const response = await this.axiosClient.get("/exchangeInfo");
      const count = response.data.symbols?.length || 0;

      console.log(`✅ Vest Exchange connected: ${count} pairs available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Vest Exchange:", error);
      return 0;
    }
  }

  public async getTokenInfo(token: TokenSymbol): Promise<TokenInfo> {
    try {
      const response = await this.axiosClient.get(`/exchangeInfo?symbols=${token}-PERP`);
      const info: TokenInfo = response.data.symbols[0];
      return info;
    } catch (error) {
      console.error("❌ Failed to retrive token info:", error);
      throw new Error("Failed to fetch token info from Vest");
    }
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all tickers which contain funding rates
      const response = await this.axiosClient.get("/ticker/latest");
      const tickerData = response.data.tickers;

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(tickerData);

      for (const token of tokensToProcess) {
        const symbol = `${token}-PERP`;

        try {
          // Find the ticker for this token
          const tokenTicker = tickerData.find((ticker: any) => ticker.symbol === symbol);

          if (tokenTicker) {
            // Calculate next funding time (hourly funding)
            const now = new Date();
            const nextFunding = new Date(now.getTime() + (60 - now.getMinutes()) * 60 * 1000);
            nextFunding.setSeconds(0);
            nextFunding.setMilliseconds(0);

            fundingRates.push({
              exchange: this.name,
              token,
              fundingRate: parseFloat(tokenTicker.oneHrFundingRate), // 1h funding rate
              nextFunding,
              fundingFrequency: this.config.get("fundingFrequency"), // in hours
              timestamp: new Date(),
              markPrice: tokenTicker.markPrice ? parseFloat(tokenTicker.markPrice) : undefined,
              indexPrice: tokenTicker.indexPrice ? parseFloat(tokenTicker.indexPrice) : undefined,
            });
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Vest:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Vest funding rates:", error);
      throw new Error("Failed to fetch funding rates from Vest");
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      const response = await this.axiosClient.get("/account");
      const balances: { [token: string]: number } = {};

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          // Vest uses USDC as primary numéraire
          balances[balance.coin] = parseFloat(balance.total);
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Vest account balance:", error);
      throw new Error("Failed to fetch account balance from Vest");
    }
  }

  public async setLeverage(token: TokenSymbol, leverage: number): Promise<{ symbol: string; value: number }> {
    const time = Date.now();
    const payload = { time, symbol: `${token}-PERP`, value: leverage };
    const response = await this.axiosClient.post("/account/leverage", payload).catch((reason: any) => {
      // console.error(this.name, payload, reason);
      throw new Error(
        reason.data.detail.msg ||
          (reason.data ? JSON.stringify(reason.data) : undefined) ||
          reason.message ||
          "Unknown error #1",
      );
    });
    return response.data as { symbol: string; value: number };
  }

  public async openPosition(order: OrderData): Promise<PlacedOrderData> {
    const { token, side, price } = order;
    try {
      const symbol = `${token}-PERP`;
      const isBuy = side === OrderSide.LONG;
      const time = Date.now();

      const info = await this.getTokenInfo(token);
      const limitPrice = (isBuy ? price * (1 + order.slippage / 100) : price * (1 - order.slippage / 100)).toFixed(
        info.priceDecimals,
      );
      const size = order.size.toFixed(info.sizeDecimals);

      if (order.leverage) await this.setLeverage(order.token, order.leverage);

      const payload = {
        time,
        nonce: time,
        symbol,
        isBuy,
        size,
        orderType: "MARKET",
        limitPrice,
        reduceOnly: false,
        timeInForce: "GTC",
      };

      const privateKey: string = this.config.get<string>("privateKey");
      const signature = generateOrderSignature(payload, privateKey);

      const response = await this.axiosClient.post("/orders", { payload, signature }).catch((reason: any) => {
        console.error(payload, reason);
        throw new Error(reason.data.detail.msg || "Unknown error #2");
      });

      if (response.data.orderId || response.data.id) {
        const orderId = response.data.orderId || response.data.id;
        // console.log(`✅ Vest ${side} position opened: ${orderId}`);
        return { ...order, id: orderId.toString(), size: parseFloat(size), price: parseFloat(limitPrice) };
      }

      console.error(response);
      throw new Error(`Failed to open position: ${response?.data.detail.msg || "Unknown error #3"}`);
    } catch (error) {
      // console.error(
      //   `Error opening Vest ${side} position for ${token}:`,
      //   error,
      //   JSON.stringify((error as any).response?.data),
      //   (error as any).response?.data.detail.msg,
      // );
      throw error;
    }
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      const response = await this.axiosClient.post("/orders/cancel", {
        orderId: positionId,
      });

      if (response.data.success || response.status === 200) {
        console.log(`✅ Vest position closed: ${positionId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error closing Vest position ${positionId}:`, error);
      return false;
    }
  }

  private extractTokensFromTickers(tickerData: any[]): TokenSymbol[] {
    const tokens = tickerData
      .map((ticker): TokenSymbol => ticker.symbol)
      .filter((symbol) => !symbol.endsWith("-USD-PERP"))
      .map((symbol) => symbol.replace("-PERP", ""));
    return tokens;
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Get account info which includes positions
      const response = await this.axiosClient.get("/account");

      if (response.data.positions) {
        const position = response.data.positions.find((pos: any) => pos.id === positionId);
        if (position && position.unrealizedPnl) {
          return parseFloat(position.unrealizedPnl);
        }
      }

      return 0;
    } catch (error) {
      console.error(`Error fetching Vest position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Vest");
    }
  }

  public async getAllPositions(): Promise<any[]> {
    try {
      const response = await this.axiosClient.get("/account");
      return response.data.positions || [];
    } catch (error) {
      console.error("Error fetching Vest positions:", error);
      throw new Error("Failed to fetch positions from Vest");
    }
  }

  public async getOrderHistory(symbol?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = {};
      if (symbol) params.symbol = symbol;
      if (limit) params.limit = limit;

      const response = await this.axiosClient.get("/orders", { params });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching Vest order history:", error);
      throw new Error("Failed to fetch order history from Vest");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Vest WebSocket connected");

        // Subscribe to tickers for funding rate updates
        const subscribeMessage = {
          method: "subscribe",
          stream: "tickers",
          symbols: ["BTC-PERP", "ETH-PERP", "SOL-PERP"], // Add more as needed
        };

        this.ws?.send(JSON.stringify(subscribeMessage));
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Vest WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Vest WebSocket error:", error);
      });

      this.ws.on("close", () => {
        console.log("Vest WebSocket disconnected");
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Vest WebSocket:", error);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const vestExchange = new VestExchange();
export default vestExchange;
