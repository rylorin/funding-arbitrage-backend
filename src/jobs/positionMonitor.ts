import cron from 'node-cron';
import { Position, User } from '../models/index';
import { getWebSocketHandlers } from '../websocket/handlers';
import { PositionPnL, JobResult } from '../types/index';

export class PositionMonitor {
  private isRunning = false;
  private lastExecution: Date | null = null;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.setupCronJob();
  }

  private setupCronJob(): void {
    // Run every 30 seconds: */30 * * * * *
    this.cronJob = cron.schedule('*/30 * * * * *', async () => {
      await this.monitorPositions();
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    console.log('📅 Position monitor job scheduled (every 30 seconds)');
  }

  public start(): void {
    if (this.cronJob) {
      this.cronJob.start();
      console.log('▶️ Position monitor started');
    }
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏹️ Position monitor stopped');
    }
  }

  public async monitorPositions(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return {
        success: false,
        message: 'Monitor already in progress',
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;

    try {
      // Get all open positions
      const openPositions = await Position.findAll({
        where: {
          status: 'OPEN',
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'walletAddress', 'settings'],
          },
        ],
      });

      if (openPositions.length === 0) {
        this.lastExecution = new Date();
        return {
          success: true,
          message: 'No open positions to monitor',
          executionTime: Date.now() - startTime,
        };
      }

      console.log(`🔍 Monitoring ${openPositions.length} open positions...`);

      const positionsToClose: Position[] = [];
      const pnlUpdates: Array<{ userId: string; positionPnL: PositionPnL }> = [];
      const errors: string[] = [];

      for (const position of openPositions) {
        try {
          // TODO: Get real-time PnL from exchanges
          // For now, simulate PnL calculation
          const simulatedPnL = this.simulatePnLCalculation(position);
          
          // Update position PnL
          if (Math.abs(simulatedPnL - position.currentPnl) > 0.01) {
            position.currentPnl = simulatedPnL;
            await position.save();

            // Prepare WebSocket update
            const positionPnL: PositionPnL = {
              positionId: position.id,
              currentPnL: position.currentPnl,
              unrealizedPnL: position.currentPnl,
              realizedPnL: 0,
              totalFees: 0, // TODO: Calculate from trade history
              currentAPR: this.calculateCurrentAPR(position),
              hoursOpen: position.getHoursOpen(),
              lastUpdated: new Date(),
            };

            pnlUpdates.push({
              userId: position.userId,
              positionPnL,
            });
          }

          // Check if position should be auto-closed
          if (position.shouldAutoClose()) {
            const reason = this.getAutoCloseReason(position);
            console.log(`🚨 Position ${position.id} flagged for auto-close: ${reason}`);
            positionsToClose.push(position);
          }

        } catch (positionError) {
          console.error(`Error processing position ${position.id}:`, positionError);
          errors.push(`Position ${position.id}: ${positionError}`);
        }
      }

      // Send WebSocket updates
      const wsHandlers = getWebSocketHandlers();
      if (wsHandlers && pnlUpdates.length > 0) {
        pnlUpdates.forEach(({ userId, positionPnL }) => {
          wsHandlers.handlePositionPnLUpdate(userId, positionPnL);
        });
      }

      // Mark positions for closure (actual closure will be handled by autoCloser job)
      if (positionsToClose.length > 0) {
        for (const position of positionsToClose) {
          position.status = 'CLOSING';
          await position.save();
        }
        console.log(`⚠️ Flagged ${positionsToClose.length} positions for auto-closure`);
      }

      this.lastExecution = new Date();
      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: true,
        message: `Monitored ${openPositions.length} positions`,
        data: {
          positionsMonitored: openPositions.length,
          pnlUpdates: pnlUpdates.length,
          positionsFlaggedForClosure: positionsToClose.length,
          errors: errors.length,
        },
        executionTime,
      };

      if (errors.length === 0) {
        console.log(`✅ Position monitoring completed: ${result.message} (${executionTime}ms)`);
      } else {
        console.log(`⚠️ Position monitoring completed with errors: ${result.message} (${executionTime}ms)`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Position monitoring failed:', error);
      
      return {
        success: false,
        message: 'Position monitoring failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private simulatePnLCalculation(position: Position): number {
    // This is a simplified simulation
    // In real implementation, this would call exchange APIs to get current position values
    
    const hoursOpen = position.getHoursOpen();
    const { longRate, shortRate } = position.entryFundingRates;
    
    // Calculate funding payments received/paid
    const fundingPerHour = (shortRate - longRate) / 8; // Funding typically paid every 8 hours
    const fundingAccrued = fundingPerHour * hoursOpen;
    const fundingValue = position.size * fundingAccrued;
    
    // Add some random market movement (±2%)
    const marketMovement = (Math.random() - 0.5) * 0.04 * position.size;
    
    return Number((fundingValue + marketMovement).toFixed(8));
  }

  private calculateCurrentAPR(position: Position): number {
    const hoursOpen = position.getHoursOpen();
    if (hoursOpen === 0) return 0;
    
    const annualizedReturn = (position.currentPnl / position.size) * (8760 / hoursOpen) * 100;
    return Number(annualizedReturn.toFixed(2));
  }

  private getAutoCloseReason(position: Position): string {
    const hoursOpen = position.getHoursOpen();
    const currentAPR = this.calculateCurrentAPR(position);
    
    if (position.currentPnl <= position.autoClosePnLThreshold) {
      return `PnL threshold reached: ${position.currentPnl}% <= ${position.autoClosePnLThreshold}%`;
    }
    
    if (currentAPR < position.autoCloseAPRThreshold) {
      return `APR below threshold: ${currentAPR}% < ${position.autoCloseAPRThreshold}%`;
    }
    
    if (hoursOpen >= 168) { // 7 days default timeout
      return `Position timeout: ${hoursOpen} hours >= 168 hours`;
    }
    
    return 'Unknown reason';
  }

  public async runOnce(): Promise<JobResult> {
    return await this.monitorPositions();
  }

  public getStatus(): {
    isRunning: boolean;
    lastExecution: Date | null;
    isScheduled: boolean;
  } {
    return {
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
}

export const positionMonitor = new PositionMonitor();