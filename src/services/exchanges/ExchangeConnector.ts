import { ExchangeName, FundingRateData, TokenSymbol } from "@/types";
import axios, { AxiosInstance } from "axios";
import { default as config, IConfig } from "config";

export enum OrderSide {
  LONG = "long",
  SHORT = "short",
}

export type OrderData = {
  token: TokenSymbol;
  side: OrderSide;
  size: number;
  price: number;
};

export abstract class ExchangeConnector {
  public readonly name: ExchangeName;
  public readonly isEnabled: boolean = false;
  public isConnected: boolean = false;

  protected readonly config: IConfig;
  protected readonly baseUrl: string;
  protected readonly wsUrl: string;
  protected readonly client: AxiosInstance;

  constructor(name: ExchangeName) {
    this.name = name;
    this.config = config.get(name);
    this.isEnabled = this.config.has("enabled") ? this.config.get("enabled") : false;
    this.baseUrl = this.config.has("baseUrl") ? this.config.get("baseUrl") : "";
    this.wsUrl = this.config.has("webSocketURL") ? this.config.get("webSocketURL") : "";

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10_000,
      headers: {
        "Content-Type": "application/json",
      },
    });
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
