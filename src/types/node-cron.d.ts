declare module 'node-cron' {
  export interface ScheduledTask {
    start(): void;
    stop(): void;
    destroy(): void;
    getStatus(): 'scheduled' | 'running' | 'stopped';
  }

  export function schedule(
    cronExpression: string,
    task: () => void | Promise<void>,
    options?: {
      scheduled?: boolean;
      timezone?: string;
    }
  ): ScheduledTask;

  export function validate(cronExpression: string): boolean;
}