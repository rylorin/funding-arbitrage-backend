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

  public getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    throw `${this.name} ExchangeConnector.getFundingRates not implemented`;
  }
  public getAccountBalance(): Promise<Record<string, number>> {
    throw `${this.name} ExchangeConnector.getAccountBalance not implemented`;
  }
  public openPosition(_order: OrderData): Promise<string> {
    throw `${this.name} ExchangeConnector.openPosition not implemented`;
  }
  public closePosition(_positionId: string): Promise<boolean> {
    throw `${this.name} ExchangeConnector.closePosition not implemented`;
  }
  public getPositionPnL(_positionId: string): Promise<number> {
    throw `${this.name} ExchangeConnector.getPositionPnL not implemented`;
  }

  protected readonly config: IConfig;
  protected readonly baseUrl: string;
  protected readonly wsUrl: string;
  protected readonly client: AxiosInstance;

  constructor(name: ExchangeName) {
    this.name = name;
    this.config = config.get(name);
    this.isEnabled = this.config.has("enabled") ? this.config.get("enabled") : false;
    if (!this.isEnabled) {
      console.warn(`⚠️ ${this.name} Exchange is disabled in configuration`);
    } else {
      console.log(`ℹ️ ${this.name} Exchange is enabled`);
      // console.log(JSON.stringify(config.util.toObject()));
    }
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
}
