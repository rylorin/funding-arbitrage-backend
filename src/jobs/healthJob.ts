import healthService from "@/services/HealthService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class HealthJob extends CronJob {
  constructor() {
    super("*/30 * * * * *");
  }

  public async runOnce(): Promise<JobResult> {
    return healthService.executeHealthCheck();
  }
}

export const healthJob = new HealthJob();
