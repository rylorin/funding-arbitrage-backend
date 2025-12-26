import { jobManager } from ".";
import { deltaNeutralTradingService } from "../services/DeltaNeutralTradingService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class AutoTrader extends CronJob {
  constructor() {
    super("*/5 * * * *");
  }

  public async runOnce(): Promise<JobResult> {
    const now = Date.now();
    const systemStatus = await jobManager.getHealthCheck();
    if (systemStatus.overall !== "healthy") {
      console.warn("⚠️ System is not healthy, skipping autoTrader job");
      return {
        success: false,
        message: "System is not healthy",
        executionTime: Date.now() - now,
      };
    }
    return deltaNeutralTradingService.runOnce();
  }
}

export const autoTrader = new AutoTrader();
