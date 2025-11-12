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
  leverage?: number;
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
        "x-api-key": this.config.has("apiKey") ? this.config.get("apiKey") : undefined,
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

  public getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    throw `${this.name} ExchangeConnector.getFundingRates not implemented`;
  }
  public getAccountBalance(): Promise<Record<string, number>> {
    throw `${this.name} ExchangeConnector.getAccountBalance not implemented`;
  }
  public openPosition(_order: OrderData): Promise<string> {
    throw `${this.name} ExchangeConnector.openPosition not implemented`;
  }
  public closePosition(positionId: string): Promise<boolean> {
    throw `${this.name} ExchangeConnector.closePosition(${positionId}) not implemented`;
  }
  public getPositionPnL(positionId: string): Promise<number> {
    throw `${this.name} ExchangeConnector.getPositionPnL(${positionId}) not implemented`;
  }
}
