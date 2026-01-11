import { jobManager } from ".";
import { deltaNeutralTradingService } from "../services/DeltaNeutralTradingService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class AutoCloser extends CronJob {
  constructor() {
    super("*/2 * * * *"); // Every 2 minutes
  }

  public async processAutoClosures(): Promise<JobResult> {
    // Déléguer à DeltaNeutralTradingService
    const result = await deltaNeutralTradingService.monitorAndAutoClose();

    // Mettre à jour la dernière exécution
    this.lastExecution = new Date();

    return result;
  }

  public async runOnce(): Promise<JobResult> {
    const now = Date.now();
    const systemStatus = await jobManager.getHealthCheck();
    if (systemStatus.overall !== "healthy") {
      console.warn("⚠️ System is not healthy, skipping autoCloser job");
      return {
        success: false,
        message: "System is not healthy",
        executionTime: Date.now() - now,
      };
    }
    return this.processAutoClosures();
  }
}

export const autoCloser = new AutoCloser();
