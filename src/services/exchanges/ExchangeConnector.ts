import { parseJsonWithBigNumber } from "@/extended/utils/json";
import { Position } from "@/models";
import { ExchangeName, FundingRateData, TokenSymbol } from "@/types";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { default as config, IConfig } from "config";

export enum OrderSide {
  LONG = "long",
  SHORT = "short",
}

export type OrderData = {
  exchange: ExchangeName;
  token: TokenSymbol;
  side: OrderSide;
  size: number;
  price: number;
  leverage: number;
  slippage: number;
};

export type PlacedOrderData = OrderData & { id: string };

const safeParseResponse = (data: unknown) => {
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

  constructor(name: ExchangeName) {
    this.name = name;
    this.config = config.get(name);
    this.isEnabled = this.config.has("enabled") ? this.config.get("enabled") : false;
    this.baseUrl = this.config.has("baseUrl") ? this.config.get("baseUrl") : "";
    this.wsUrl = this.config.has("webSocketURL") ? this.config.get("webSocketURL") : "";

    this.axiosClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10_000,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.config.has("apiKey") ? this.config.get("apiKey") : undefined,
      },
      paramsSerializer: {
        indexes: null,
      },
      // transformResponse: [safeParseResponse],
    });
    this.axiosClient.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          console.error(error.request?.method, error.request?.path, error.request?.data);
          console.error(error.response?.status, error.response?.statusText, error.response?.data);
          console.error(JSON.stringify(error.response?.data));
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

  public async testConnection(): Promise<number> {
    throw `${this.name} ExchangeConnector.testConnection() not implemented`;
  }
  public async getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    throw `${this.name} ExchangeConnector.getFundingRates not implemented`;
  }
  public async openPosition(_order: OrderData): Promise<PlacedOrderData> {
    throw `${this.name} ExchangeConnector.openPosition not implemented`;
  }
  public async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    throw `${this.name} ExchangeConnector.cancelOrder(${order.id}) not implemented`;
  }
  public async getPositions(): Promise<Position[]> {
    throw `${this.name} ExchangeConnector.getPositions not implemented`;
  }
  protected extractTokenFromTicker(symbol: string): TokenSymbol | null {
    throw `${this.name} ExchangeConnector.extractTokenFromTicker(${symbol}) not implemented`;
  }
  protected tokenToTicker(token: TokenSymbol): string {
    throw `${this.name} ExchangeConnector.tokenToTicker(${token}) not implemented`;
  }

  public getAccountBalance(): Promise<Record<string, number>> {
    throw `${this.name} ExchangeConnector.getAccountBalance not implemented`;
  }
  public closePosition(position: Position): Promise<boolean> {
    throw `${this.name} ExchangeConnector.closePosition(${position.id}) not implemented`;
  }
  public getPositionPnL(positionId: string): Promise<number> {
    throw `${this.name} ExchangeConnector.getPositionPnL(${positionId}) not implemented`;
  }
}
