import { PositionSide, PositionStatus } from "@/models/Position";
import { TradeStatus } from "@/models/TradeHistory";
import { default as config, IConfig } from "config";
import { Op } from "sequelize";
import { exchangesRegistry } from "../exchanges";
import { FundingRate, Position, TradeHistory } from "../models";
import { JobResult, Service, ServiceName } from "../types";
import { OpportunityDetectionService } from "./OpportunityDetectionService";

export type PositionMetrics = {
  cost: number;
  currentApr: number;
  currentPnL: number;
  hoursOpen: number;
};

export class PositionSyncService implements Service {
  public readonly name: ServiceName = ServiceName.POSITION_SYNC;
  public readonly config: IConfig;

  constructor() {
    this.config = config.get("services." + this.name);
  }

  // Fetching positions from all exchanges
  private async fetchAllExchangesPositions(): Promise<Position[]> {
    let positions: Position[] = [];

    for (const exchange of exchangesRegistry.getAllExchanges()) {
      try {
        console.debug(`ℹ️ Fetching positions from ${exchange.name}`);
        const exchangePos = await exchange.getAllPositions();
        positions = positions.concat(exchangePos);
        console.log(`✅ Received ${exchangePos.length} positions from ${exchange.name}`);
      } catch (error) {
        console.error(`❌ Error fetching positions from ${exchange.name}`, error);
      }
    }

    return positions;
  }

  // Update single legs positions from DB using exchanges positions
  private async unpdateDbLegs(
    positions: Position[],
  ): Promise<{ syncedPositions: TradeHistory[]; failedPositions: TradeHistory[] }> {
    const now = Date.now();
    const syncedPositions: TradeHistory[] = [];
    const failedPositions: TradeHistory[] = [];

    const trades = await TradeHistory.findAll({
      where: {
        status: { [Op.in]: [TradeStatus.OPENING, TradeStatus.OPEN, TradeStatus.CLOSING] },
      },
    });
    await trades.reduce(
      (p, trade) =>
        p.then(async () => {
          const legs = await Position.findAll({
            where: {
              tradeId: trade.id,
            },
          });
          // Update single legs
          for (const leg of legs) {
            // Find corresponding exchange position
            const update = positions.find((pos) => pos.exchange == leg.exchange && pos.token == leg.token);
            if (update) {
              // position existing in exchange, update DB from it
              await leg.update({
                status: update.status,
                side: update.side,
                size: update.size,
                price: update.price,
                leverage: update.leverage,
                cost: update.cost || undefined,
                unrealizedPnL: update.unrealizedPnL,
                realizedPnL: update.realizedPnL,
                entryTimestamp: update.entryTimestamp || undefined,
              });
            } else {
              // position not found on exchange
              switch (leg.status) {
                case PositionStatus.OPENING:
                  if (now > leg.createdAt.getTime() + this.config.get<number>("graceDelay") * 1_000) {
                    // Something went wrong
                    await leg.update({
                      status: PositionStatus.ERROR,
                    });
                  }
                  break;
                case PositionStatus.OPEN:
                  // Something wrong happened
                  await leg.update({
                    status: PositionStatus.ERROR,
                  });
                  break;
                case PositionStatus.CLOSING:
                  // Ok, position finally closed
                  await leg.update({
                    status: PositionStatus.CLOSED,
                  });
                  break;
              }
            }
          }

          // Update trade status
          const allOpen = legs.reduce((p, leg) => (leg.status == PositionStatus.OPEN ? p : false), true);
          const allClosed = legs.reduce(
            (p, leg) => (leg.status == PositionStatus.CLOSED || leg.status == PositionStatus.ERROR ? p : false),
            true,
          );
          switch (trade.status) {
            case TradeStatus.OPENING:
              if (allOpen) {
                await trade.update({ status: TradeStatus.OPEN });
              }
              break;
            case TradeStatus.OPEN:
              {
                const metrics = await this.getPositionMetrics(trade);
                if (metrics) {
                  // Mettre à jour la position en DB
                  await trade.update({
                    cost: metrics.cost,
                    currentPnL: metrics.currentPnL,
                    currentApr: metrics.currentApr,
                  });
                }
              }
              syncedPositions.push(trade);
              break;
            case TradeStatus.CLOSING:
              if (allClosed) {
                await trade.update({ status: TradeStatus.CLOSED });
              }
          }
        }),
      Promise.resolve(),
    );
    return { syncedPositions, failedPositions };
  }

  /**
   * Synchronise toutes les positions ouvertes avec les exchanges
   */
  public async syncAllPositions(): Promise<JobResult> {
    const startTime = Date.now();

    try {
      console.log("🔄 Starting position synchronization...");

      // Fetching positions from all exchanges
      const positions = await this.fetchAllExchangesPositions();

      // Update DB
      const { syncedPositions, failedPositions } = await this.unpdateDbLegs(positions);

      // Broadcast des mises à jour PnL via WebSocket
      // if (pnlUpdates.length > 0) {
      //   const wsHandlers = getWebSocketHandlers();
      //   if (wsHandlers && "handlePositionPnLUpdate" in wsHandlers) {
      //     pnlUpdates.forEach(({ userId, positionPnL }) => {
      //       (wsHandlers as any).handlePositionPnLUpdate(userId, positionPnL);
      //     });
      //   }
      // }

      const executionTime = Date.now() - startTime;
      const result: JobResult = {
        success: failedPositions.length === 0,
        message: `Synced ${syncedPositions.length} positions, ${failedPositions.length} failed`,
        data: {
          syncedPositions: syncedPositions.length,
          failedPositions: failedPositions.length,
          totalPositions: syncedPositions.length + failedPositions.length,
          failures: failedPositions,
        },
        executionTime,
      };

      if (failedPositions.length === 0) {
        console.log(`✅ Position sync completed: ${result.message} (${executionTime}ms)`);
      } else {
        console.log(`⚠️ Position sync completed with failures: ${result.message} (${executionTime}ms)`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Position sync failed:", error);

      return {
        success: false,
        message: "Position sync failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    }
  }

  /**
   * Synchronise les métriques d'une position spécifique
   */
  public async getPositionMetrics(position: TradeHistory): Promise<PositionMetrics | null> {
    try {
      const legs = await Position.findAll({
        where: {
          tradeId: position.id,
        },
      });
      const longLeg = legs.find((pos) => pos.side == PositionSide.LONG);
      const shortLeg = legs.find((pos) => pos.side == PositionSide.SHORT);
      if (!longLeg || !shortLeg) {
        return null;
      }

      const cost = legs.reduce((p, leg) => p + leg.cost, 0);

      // Calculer le PnL actuel
      const currentPnL = await this.calculatePositionPnL(legs);

      // Calculer l'APR actuel
      const currentApr = await this.calculateCurrentAPR(legs);

      // Calculer les heures d'ouverture
      const hoursOpen = this.calculateHoursOpen(position);

      // Estimer les frais totaux
      // const totalFees = this.calculateTotalFees(position, hoursOpen);

      const metrics = {
        cost,
        currentApr,
        hoursOpen,
        currentPnL,
      };
      console.debug(position.token, position.exchange, metrics);
      return metrics;
    } catch (error) {
      console.error(`Error calculating metrics for position ${position.id}:`, error);
      throw error;
    }
  }

  /**
   * Calcule le PnL actuel d'une position
   */
  public calculatePositionPnL(positions: Position[]): number {
    return positions.reduce((p, item) => p + item.unrealizedPnL + item.realizedPnL, 0);
  }

  /**
   * Calcule l'APR actuel d'une position
   */
  public async calculateCurrentAPR(legs: Position[]): Promise<number> {
    let spreadAPR = Number.NEGATIVE_INFINITY;
    const longLeg = legs.find((pos) => pos.side == PositionSide.LONG)!;
    const shortLeg = legs.find((pos) => pos.side == PositionSide.SHORT)!;

    const longRate = await FundingRate.findOne({
      where: {
        exchange: longLeg.exchange,
        token: longLeg.token,
      },
    });
    const shortRate = await FundingRate.findOne({
      where: {
        exchange: shortLeg.exchange,
        token: shortLeg.token,
      },
    });

    if (longRate && shortRate) spreadAPR = OpportunityDetectionService.calculateSpreadAPR(longRate, shortRate);

    return spreadAPR;
  }

  /**
   * Calcule les heures d'ouverture d'une position
   */
  private calculateHoursOpen(trade: TradeHistory): number {
    const now = Date.now();
    const diffMs = now - trade.createdAt.getTime();
    return diffMs / (1000 * 60 * 60); // Convertir en heures
  }

  /**
   * Estime les frais totaux d'une position
   */
  private calculateTotalFees(position: any, hoursOpen: number): number {
    // Estimation basée sur la taille de la position et le temps d'ouverture
    const estimatedFeeRate = 0.001; // 0.1% de frais estimés totaux
    return position.size * estimatedFeeRate * (hoursOpen / 24);
  }

  /**
   * Calcule les frais de funding reçus
   */
  private calculateFundingFeesReceived(position: any, longRate: any, shortRate: any, hoursOpen: number): number {
    // Calcul simplifié - en réalité, il faudrait tracker les paiements de funding réels
    const avgRate = (Math.abs(longRate.fundingRate) + Math.abs(shortRate.fundingRate)) / 2;
    const fundingCycles = hoursOpen / (longRate.exchange === "vest" || longRate.exchange === "extended" ? 1 : 8);

    return avgRate * fundingCycles * position.size;
  }

  /**
   * Récupère les positions actives enrichies avec les métriques actuelles
   */
  public async getActivePositions(): Promise<any[]> {
    try {
      const activePositions = await TradeHistory.findAll({
        where: { status: { [Op.in]: ["OPEN"] } },
      });

      // Enrichir avec les métriques actuelles
      const enrichedPositions = await Promise.all(
        activePositions.map(async (position) => {
          const metrics = await this.getPositionMetrics(position);

          return {
            ...position.toJSON(),
            // currentPnL: metrics.currentPnL,
            // currentApr: metrics.currentApr,
            // hoursOpen: metrics.hoursOpen,
            // shouldClose: metrics.currentAPR < position.autoCloseAPRThreshold,
          };
        }),
      );

      return enrichedPositions;
    } catch (error) {
      console.error("Error getting active positions:", error);
      throw new Error("Failed to get active positions");
    }
  }
}

export const positionSyncService = new PositionSyncService();
