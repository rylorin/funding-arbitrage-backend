import { deltaNeutralTradingService } from "../services/DeltaNeutralTradingService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class AutoCloser extends CronJob {
  constructor() {
    super();
  }

  public async processAutoClosures(): Promise<JobResult> {
    // Déléguer à DeltaNeutralTradingService
    const result = await deltaNeutralTradingService.monitorAndAutoClose();

    // Mettre à jour la dernière exécution
    this.lastExecution = new Date();

    return result;
  }

  public async runOnce(): Promise<JobResult> {
    return this.processAutoClosures();
  }
}

export const autoCloser = new AutoCloser();
