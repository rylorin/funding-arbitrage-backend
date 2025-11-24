import { parseJsonWithBigNumber } from "@/extended/utils/json";
import { Position } from "@/models";
import { FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "@/types";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { default as config, IConfig } from "config";
import WebSocket from "ws";

export type ExchangeName = "vest" | "hyperliquid" | "orderly" | "extended" | "asterperp" | "mock";

const _safeParseResponse = (data: unknown) => {
  if (!data || typeof data !== "string") {
    if (data) console.error("Undefined content returned:", data);
    return undefined;
  }
  try {
    return parseJsonWithBigNumber(data);
  } catch {
    console.error("Bad content returned:", data);
    return undefined;
  }
};

export abstract class ExchangeConnector {
  public readonly name: ExchangeName;
  public readonly isEnabled: boolean = false;
  public isConnected: boolean = false;

  public readonly config: IConfig;

  protected readonly baseUrl: string;
  protected readonly axiosClient: AxiosInstance;
  protected readonly wsUrl: string;
  protected ws: WebSocket | null = null;

  private lastNonceTimestamp = 0;

  constructor(name: ExchangeName) {
    this.name = name;
    this.config = config.get("exchanges." + name);
    this.isEnabled = this.config.has("enabled") ? this.config.get("enabled") : false;
    this.baseUrl = this.config.get<string>("baseUrl");
    this.wsUrl = this.config.has("webSocketURL") ? this.config.get<string>("webSocketURL") : "";

    this.axiosClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10_000,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.config.has("apiKey") ? this.config.get("apiKey") : undefined,
        "X-MBX-APIKEY": this.config.has("apiKey") ? this.config.get("apiKey") : undefined,
      },
      paramsSerializer: {
        indexes: null,
      },
    });
    this.axiosClient.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          // console.error(error);
          console.error(error.response?.config.method, error.response?.config.url, error.response?.config.data);
          console.error(error.response?.status, error.response?.statusText, error.response?.data);
          return Promise.reject({
            url: error.response?.config.url,
            status: error.response?.status,
            data: error.response?.data,
          });
        }

        return Promise.reject(error);
      },
    );
  }

  // Axios client proxy
  public get<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
    return this.axiosClient.get<T, R, D>(url, config);
  }
  public post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> {
    return this.axiosClient.post<T, R, D>(url, data, config);
  }
  public patch<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> {
    return this.axiosClient.patch<T, R, D>(url, data, config);
  }
  public delete<T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
    return this.axiosClient.delete<T, R, D>(url, config);
  }

  public async testConnection(): Promise<number> {
    throw `${this.name} ExchangeConnector.testConnection() not implemented`;
  }

  public connectWebSocket(_onMessage: (data: any) => void): void {
    throw `${this.name} ExchangeConnector.connectWebSocket() not implemented`;
  }

  public disconnect(): void {
    if (this.ws) {
      console.log(`🔌 Disconnecting ${this.name} WebSocket...`);
      this.isConnected = false;
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
      console.log(`✅ ${this.name} WebSocket disconnected`);
    }
  }

  /**
   * Generates a unique nonce by using the current timestamp in milliseconds
   * If multiple calls happen in the same millisecond, it ensures the nonce is still increasing
   * @returns A unique nonce value
   */
  protected generateUniqueNonce(): number {
    const timestamp = Date.now();

    // Ensure the nonce is always greater than the previous one
    if (timestamp <= this.lastNonceTimestamp) {
      // If we're in the same millisecond, increment by 1 from the last nonce
      this.lastNonceTimestamp += 1;
      return this.lastNonceTimestamp;
    }

    // Otherwise use the current timestamp
    this.lastNonceTimestamp = timestamp;
    return timestamp;
  }

  public async getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    throw `${this.name} ExchangeConnector.getFundingRates not implemented`;
  }
  public async openPosition(order: OrderData, reduceOnly: boolean = false): Promise<PlacedOrderData> {
    throw `${this.name} ExchangeConnector.openPosition(${order.token},${reduceOnly}) not implemented`;
  }
  public async closePosition(order: OrderData): Promise<PlacedOrderData> {
    return this.openPosition(order, true);
  }
  public async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    throw `${this.name} ExchangeConnector.cancelOrder(${order.orderId}) not implemented`;
  }
  public async getAllPositions(): Promise<Position[]> {
    throw `${this.name} ExchangeConnector.getAllPositions not implemented`;
  }
  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    throw `${this.name} ExchangeConnector.tokenFromTicker(${symbol}) not implemented`;
  }
  protected tokenToTicker(token: TokenSymbol): string {
    throw `${this.name} ExchangeConnector.tokenToTicker(${token}) not implemented`;
  }

  public getAccountBalance(): Promise<Record<string, number>> {
    throw `${this.name} ExchangeConnector.getAccountBalance not implemented`;
  }
  public getPositionPnL(positionId: string): Promise<number> {
    throw `${this.name} ExchangeConnector.getPositionPnL(${positionId}) not implemented`;
  }
}
