import autoTradingService from "@/services/AutoTradingService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class AutoTrader extends CronJob {
  constructor() {
    super("*/5 * * * *");
  }

  public async runOnce(): Promise<JobResult> {
    return autoTradingService.runOnce();
  }
}

export const autoTrader = new AutoTrader();
