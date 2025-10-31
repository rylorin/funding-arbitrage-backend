import { ExchangeName, FundingRateData, TokenSymbol } from "@/types";
import { default as config, IConfig } from "config";

export abstract class ExchangeConnector {
  public name!: ExchangeName;
  public isEnabled: boolean = false;
  public isConnected: boolean = false;
  public abstract getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]>;
  public abstract getAccountBalance(): Promise<Record<string, number>>;
  public abstract openPosition(token: TokenSymbol, side: "long" | "short", size: number): Promise<string>;
  public abstract closePosition(positionId: string): Promise<boolean>;
  public abstract getPositionPnL(positionId: string): Promise<number>;

  protected config: IConfig;
  protected baseUrl: string;
  protected wsUrl: string;

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
    this.baseUrl = this.config.get("baseUrl");
    this.wsUrl = this.config.get("webSocketURL");
  }
}
