import cron from 'node-cron';
import { Position, TradeHistory, User } from '../models/index';
import { vestExchange } from '../services/exchanges/VestExchange';
import { getWebSocketHandlers } from '../websocket/handlers';
import { JobResult } from '../types/index';

export class AutoCloser {
  private isRunning = false;
  private lastExecution: Date | null = null;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.setupCronJob();
  }

  private setupCronJob(): void {
    // Run every minute: * * * * *
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processAutoClosures();
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    console.log('📅 Auto closer job scheduled (every minute)');
  }

  public start(): void {
    if (this.cronJob) {
      this.cronJob.start();
      console.log('▶️ Auto closer started');
    }
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏹️ Auto closer stopped');
    }
  }

  public async processAutoClosures(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return {
        success: false,
        message: 'Auto closure already in progress',
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;

    try {
      // Get all positions marked for closing
      const positionsToClose = await Position.findAll({
        where: {
          status: 'CLOSING',
          autoCloseEnabled: true,
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'walletAddress', 'settings'],
          },
        ],
      });

      if (positionsToClose.length === 0) {
        this.lastExecution = new Date();
        return {
          success: true,
          message: 'No positions to auto-close',
          executionTime: Date.now() - startTime,
        };
      }

      console.log(`🔄 Processing ${positionsToClose.length} auto-closures...`);

      const successfulClosures: Position[] = [];
      const failedClosures: Array<{ position: Position; error: string }> = [];

      for (const position of positionsToClose) {
        try {
          const closureResult = await this.closePosition(position);
          
          if (closureResult.success) {
            successfulClosures.push(position);
            
            // Broadcast closure notification
            const wsHandlers = getWebSocketHandlers();
            if (wsHandlers) {
              wsHandlers.handlePositionClosed(
                position.userId,
                position.id,
                position.closedReason || 'Auto-closed',
                position.currentPnl
              );
            }
            
            console.log(`✅ Auto-closed position ${position.id}: ${position.closedReason}`);
          } else {
            failedClosures.push({ 
              position, 
              error: closureResult.error || 'Unknown error' 
            });
            
            // Mark position as error state
            position.status = 'ERROR';
            position.closedReason = `Auto-closure failed: ${closureResult.error}`;
            await position.save();
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          failedClosures.push({ position, error: errorMessage });
          
          // Mark position as error state
          position.status = 'ERROR';
          position.closedReason = `Auto-closure failed: ${errorMessage}`;
          await position.save();
          
          console.error(`❌ Failed to auto-close position ${position.id}:`, error);
        }
      }

      this.lastExecution = new Date();
      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: successfulClosures.length > 0 || failedClosures.length === 0,
        message: `Processed ${positionsToClose.length} auto-closures`,
        data: {
          positionsProcessed: positionsToClose.length,
          successfulClosures: successfulClosures.length,
          failedClosures: failedClosures.length,
          closedPositions: successfulClosures.map(p => ({
            id: p.id,
            token: p.token,
            pnl: p.currentPnl,
            reason: p.closedReason,
          })),
          failureReasons: failedClosures.map(f => ({
            positionId: f.position.id,
            error: f.error,
          })),
        },
        executionTime,
      };

      if (failedClosures.length === 0) {
        console.log(`✅ Auto closure completed: ${result.message} (${executionTime}ms)`);
      } else {
        console.log(`⚠️ Auto closure completed with failures: ${result.message} (${executionTime}ms)`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Auto closure process failed:', error);
      
      return {
        success: false,
        message: 'Auto closure process failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async closePosition(position: Position): Promise<{ success: boolean; error?: string }> {
    try {
      // TODO: Implement actual position closure on exchanges
      // This is a simplified version for demonstration
      
      const closurePromises: Promise<boolean>[] = [];

      // Close long position
      if (position.longPositionId && position.longExchange === 'vest') {
        if (vestExchange.isConnected) {
          closurePromises.push(vestExchange.closePosition(position.longPositionId));
        } else {
          throw new Error('Vest exchange not connected');
        }
      }

      // Close short position  
      if (position.shortPositionId && position.shortExchange === 'vest') {
        if (vestExchange.isConnected) {
          closurePromises.push(vestExchange.closePosition(position.shortPositionId));
        } else {
          throw new Error('Vest exchange not connected');
        }
      }

      // Wait for all closures to complete
      const results = await Promise.allSettled(closurePromises);
      const failures = results.filter(r => r.status === 'rejected' || !r.value);
      
      if (failures.length > 0) {
        throw new Error(`Failed to close ${failures.length} out of ${results.length} positions`);
      }

      // Create trade history records
      await this.createClosureTrades(position);

      // Update position status
      position.status = 'CLOSED';
      position.closedAt = new Date();
      
      if (!position.closedReason) {
        const reason = this.determineClosureReason(position);
        position.closedReason = reason;
      }

      await position.save();

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error closing position ${position.id}:`, error);
      return { success: false, error: errorMessage };
    }
  }

  private async createClosureTrades(position: Position): Promise<void> {
    const basePrice = 50000; // TODO: Get actual market price
    const timestamp = new Date();

    const trades = [];

    // Long position closure
    if (position.longPositionId) {
      trades.push({
        userId: position.userId,
        positionId: position.id,
        action: 'CLOSE' as const,
        exchange: position.longExchange,
        token: position.token,
        side: 'close_long' as const,
        size: position.size,
        price: basePrice * (1 + Math.random() * 0.01 - 0.005), // ±0.5% variation
        fee: position.size * basePrice * 0.001, // 0.1% fee
        externalTradeId: `close_long_${position.id}_${Date.now()}`,
        timestamp,
      });
    }

    // Short position closure
    if (position.shortPositionId) {
      trades.push({
        userId: position.userId,
        positionId: position.id,
        action: 'CLOSE' as const,
        exchange: position.shortExchange,
        token: position.token,
        side: 'close_short' as const,
        size: position.size,
        price: basePrice * (1 + Math.random() * 0.01 - 0.005), // ±0.5% variation
        fee: position.size * basePrice * 0.001, // 0.1% fee
        externalTradeId: `close_short_${position.id}_${Date.now()}`,
        timestamp,
      });
    }

    if (trades.length > 0) {
      await TradeHistory.bulkCreate(trades);
    }
  }

  private determineClosureReason(position: Position): string {
    const hoursOpen = position.getHoursOpen();
    
    if (position.currentPnl <= position.autoClosePnLThreshold) {
      return `Auto-closed: PnL threshold (${position.currentPnl.toFixed(2)}% <= ${position.autoClosePnLThreshold}%)`;
    }
    
    if (hoursOpen >= 168) { // 7 days
      return `Auto-closed: Position timeout (${Math.round(hoursOpen)} hours)`;
    }
    
    return 'Auto-closed: Threshold reached';
  }

  public async runOnce(): Promise<JobResult> {
    return await this.processAutoClosures();
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

export const autoCloser = new AutoCloser();