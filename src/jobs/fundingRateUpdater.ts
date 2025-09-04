import cron from 'node-cron';
import { FundingRate } from '../models/index';
import { vestExchange } from '../services/exchanges/VestExchange';
import { getWebSocketHandlers } from '../websocket/handlers';
import { TokenSymbol, FundingRateData, JobResult } from '../types/index';

export class FundingRateUpdater {
  private isRunning = false;
  private lastExecution: Date | null = null;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.setupCronJob();
  }

  private setupCronJob(): void {
    // Run every minute: * * * * *
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.updateFundingRates();
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    console.log('📅 Funding rate updater job scheduled (every minute)');
  }

  public start(): void {
    if (this.cronJob) {
      this.cronJob.start();
      console.log('▶️ Funding rate updater started');
    }
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏹️ Funding rate updater stopped');
    }
  }

  public async updateFundingRates(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      console.log('⚠️ Funding rate update already in progress, skipping...');
      return {
        success: false,
        message: 'Update already in progress',
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;
    const tokensToUpdate: TokenSymbol[] = ['BTC', 'ETH', 'SOL', 'ARB', 'OP'];
    const updatedRates: FundingRateData[] = [];
    const errors: string[] = [];

    try {
      console.log('🔄 Starting funding rate update...');

      // Update Vest rates
      if (vestExchange.isConnected) {
        try {
          const vestRates = await vestExchange.getFundingRates(tokensToUpdate);
          
          for (const rate of vestRates) {
            try {
              // Use upsert to handle both insert and update
              const upsertData: any = {
                exchange: rate.exchange as any,
                token: rate.token as any,
                fundingRate: rate.fundingRate,
                nextFunding: rate.nextFunding,
                timestamp: rate.timestamp,
              };
              
              if (rate.markPrice !== undefined) {
                upsertData.markPrice = rate.markPrice;
              }
              
              if (rate.indexPrice !== undefined) {
                upsertData.indexPrice = rate.indexPrice;
              }
              
              await FundingRate.upsert(upsertData);
              updatedRates.push(rate);
            } catch (dbError) {
              console.error(`Error saving ${rate.token} rate for ${rate.exchange}:`, dbError);
              errors.push(`Database error for ${rate.token}/${rate.exchange}`);
            }
          }

          console.log(`✅ Updated ${vestRates.length} rates from Vest`);
        } catch (exchangeError) {
          console.error('Error fetching Vest rates:', exchangeError);
          errors.push('Vest exchange error');
        }
      } else {
        errors.push('Vest exchange not connected');
      }

      // TODO: Add other exchange updates here
      // if (hyperliquidExchange.isConnected) { ... }
      // if (orderlyExchange.isConnected) { ... }

      // Clean up old rates (keep last 7 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      try {
        const deletedCount = await FundingRate.destroy({
          where: {
            timestamp: {
              $lt: cutoffDate,
            },
          },
        });
        
        if (deletedCount > 0) {
          console.log(`🗑️ Cleaned up ${deletedCount} old funding rate records`);
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
        errors.push('Cleanup error');
      }

      // Broadcast updates via WebSocket
      if (updatedRates.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers) {
          wsHandlers.handleFundingRateUpdate(updatedRates);
        }
      }

      this.lastExecution = new Date();
      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: updatedRates.length > 0,
        message: `Updated ${updatedRates.length} rates across ${new Set(updatedRates.map(r => r.exchange)).size} exchanges`,
        data: {
          updatedRates: updatedRates.length,
          exchanges: [...new Set(updatedRates.map(r => r.exchange))],
          tokens: [...new Set(updatedRates.map(r => r.token))],
          errors,
        },
        executionTime,
      };

      if (errors.length === 0) {
        console.log(`✅ Funding rate update completed: ${result.message} (${executionTime}ms)`);
      } else {
        console.log(`⚠️ Funding rate update completed with errors: ${result.message} (${executionTime}ms)`);
        console.log(`❌ Errors: ${errors.join(', ')}`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Funding rate update failed:', error);
      
      return {
        success: false,
        message: 'Funding rate update failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  public async runOnce(): Promise<JobResult> {
    return await this.updateFundingRates();
  }

  public getStatus(): {
    isRunning: boolean;
    lastExecution: Date | null;
    isScheduled: boolean;
  } {
    return {
      isRunning: this.isRunning,
      lastExecution: this.lastExecution,
      isScheduled: this.cronJob ? this.cronJob.getStatus() === 'scheduled' : false,
    };
  }

  public destroy(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }
  }
}

export const fundingRateUpdater = new FundingRateUpdater();