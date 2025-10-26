import { positionSyncService } from "../services/PositionSyncService";
import { JobResult } from "../types/index";
import { CronJob } from "./cronJob";

export class PositionSync extends CronJob {
  constructor() {
    super("*/30 * * * * *"); // Toutes les 30 secondes
  }

  public async syncPositions(): Promise<JobResult> {
    // Déléguer à PositionSyncService
    const result = await positionSyncService.syncAllPositions();

    // Mettre à jour la dernière exécution
    this.lastExecution = new Date();

    return result;
  }

  public async runOnce(): Promise<JobResult> {
    return this.syncPositions();
  }
}

export const positionSync = new PositionSync();
