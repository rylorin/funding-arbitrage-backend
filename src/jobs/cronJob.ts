import { default as cron, ScheduledTask } from "node-cron";

export abstract class CronJob {
  protected isRunning = false;
  protected lastExecution: Date | null = null;
  protected cronJob: ScheduledTask | null = null;

  constructor(schedule = "* * * * *") {
    this.cronJob = cron.createTask(
      schedule,
      async () => {
        await this.execute();
      },
      {
        noOverlap: true,
      },
    );
    console.log(`📅 ${this.constructor.name} scheduled`);
  }

  public async start(): Promise<void> {
    if (this.cronJob) {
      this.cronJob.start();
      console.log(`▶️ ${this.constructor.name} started`);
    }
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log(`⏹️ ${this.constructor.name} stopped`);
    }
  }

  public getStatus(): {
    name: string;
    isRunning: boolean;
    lastExecution: Date | null;
    isScheduled: boolean;
  } {
    return {
      name: this.constructor.name,
      isRunning: this.isRunning,
      lastExecution: this.lastExecution,
      isScheduled: this.cronJob !== null,
    };
  }

  public destroy(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }

  protected abstract runOnce(): Promise<JobResult>;

  public async execute(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return Promise.resolve({
        success: false,
        message: `${this.constructor.name} already in progress`,
        executionTime: Date.now() - startTime,
      });
    }

    try {
      this.isRunning = true;
      const result = await this.runOnce();
      this.lastExecution = new Date();
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Error executing ${this.constructor.name}: ${error}`,
        executionTime: Date.now() - startTime,
      };
    } finally {
      this.isRunning = false;
    }
  }
}

export interface JobResult {
  success: boolean;
  message: string;
  executionTime: number; // in milliseconds
}
