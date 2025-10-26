import { JobResult } from "../types/index";
import { autoCloser } from "./autoCloser";
import { autoTrader } from "./autoTrader";
import { CronJob } from "./cronJob";
import { fundingRateUpdater } from "./fundingRateUpdater";
import { healthJob } from "./healthJob";
import { positionMonitor } from "./positionMonitor";

export class JobManager {
  private jobs: Record<string, CronJob> = {
    fundingRateUpdater,
    positionMonitor,
    autoCloser,
    autoTrader,
    healthJob,
  };

  public startAll(): void {
    console.log("🚀 Starting all background jobs...");

    Object.values(this.jobs).forEach((job) => {
      console.log(`▶️ Starting job: ${job.constructor.name}`);
      job.start();
    });

    Object.values(this.jobs).forEach(async (job) => {
      console.log(`▶️ Initial run: ${job.constructor.name}`);
      await job.execute();
    });
    Object.values(this.jobs).reduce(
      (p, job) => p.then(() => job.execute().then()),
      Promise.resolve()
    );

    console.log("✅ All background jobs started");
  }

  public stopAll(): void {
    console.log("⏹️ Stopping all background jobs...");

    Object.values(this.jobs).forEach((job) => {
      job.stop();
    });

    console.log("✅ All background jobs stopped");
  }

  public async runJobOnce(jobName: keyof typeof this.jobs): Promise<JobResult> {
    const job = this.jobs[jobName];
    if (!job) {
      throw new Error(`Job ${jobName} not found`);
    }

    return await job.execute();
  }

  public getJobStatus(jobName: keyof typeof this.jobs) {
    const job = this.jobs[jobName];
    if (!job) {
      return null;
    }

    return job.getStatus();
  }

  public getAllJobStatuses() {
    const statuses: { [key: string]: any } = {};

    Object.keys(this.jobs).forEach((jobName) => {
      const job = this.jobs[jobName as keyof typeof this.jobs];
      const status = job.getStatus();
      statuses[jobName] = status;
    });

    return statuses;
  }

  public async getHealthCheck(): Promise<{
    overall: "healthy" | "warning" | "unhealthy";
    jobs: { [key: string]: any };
    summary: {
      total: number;
      running: number;
      stopped: number;
      errors: number;
    };
  }> {
    const statuses = this.getAllJobStatuses();

    let running = 0;
    let stopped = 0;
    let errors = 0;

    Object.values(statuses).forEach((status: any) => {
      if (status.isScheduled || status.isRunning) {
        running++;
      } else {
        stopped++;
      }

      // Consider a job in error state if it hasn't run in the last 10 minutes
      const now = new Date();
      const lastExecution = status.lastExecution
        ? new Date(status.lastExecution)
        : null;
      const minutesSinceLastExecution = lastExecution
        ? Math.floor((now.getTime() - lastExecution.getTime()) / 60000)
        : Infinity;

      if (status.isScheduled && minutesSinceLastExecution > 15) {
        errors++;
      }
    });

    const total = Object.keys(statuses).length;
    let overall: "healthy" | "warning" | "unhealthy" = "healthy";

    if (errors > 0) {
      overall = "unhealthy";
    } else if (stopped > 0) {
      overall = "warning";
    }

    return {
      overall,
      jobs: statuses,
      summary: {
        total,
        running,
        stopped,
        errors,
      },
    };
  }

  public destroy(): void {
    console.log("🔥 Destroying all background jobs...");

    Object.values(this.jobs).forEach((job) => {
      job.destroy();
    });

    console.log("✅ All background jobs destroyed");
  }
}

export const jobManager = new JobManager();

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT received, shutting down gracefully...");
  jobManager.stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received, shutting down gracefully...");
  jobManager.stopAll();
  process.exit(0);
});

export { autoCloser, fundingRateUpdater, positionMonitor };
