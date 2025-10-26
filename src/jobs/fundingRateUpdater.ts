import { fundingRateService } from "../services/FundingRateService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class FundingRateUpdater extends CronJob {
  constructor() {
    super();
  }

  public async updateFundingRates(): Promise<JobResult> {
    // Déléguer à FundingRateService
    const result = await fundingRateService.updateAllFundingRates();

    // Mettre à jour la dernière exécution
    this.lastExecution = new Date();

    return result;
  }

  public async runOnce(): Promise<JobResult> {
    return this.updateFundingRates();
  }
}

export const fundingRateUpdater = new FundingRateUpdater();
