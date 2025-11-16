import { PositionSide, PositionStatus } from "@/models/Position";
import { Op } from "sequelize";
import { FundingRate, Position, TradeHistory, User } from "../models/index";
import { JobResult, PositionPnL } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { exchangesRegistry } from "./exchanges";
import { extendedExchange } from "./exchanges/ExtendedExchange";
import { hyperliquidExchange } from "./exchanges/HyperliquidExchange";
import { orderlyExchange } from "./exchanges/OrderlyExchange";
import { vestExchange } from "./exchanges/VestExchange";
import { OpportunityDetectionService } from "./OpportunityDetectionService";

export type PositionMetrics = {
  currentApr: number;
  currentPnL: number;
  hoursOpen: number;
};

export class PositionSyncService {
  private exchanges = {
    vest: vestExchange,
    hyperliquid: hyperliquidExchange,
    orderly: orderlyExchange,
    extended: extendedExchange,
  };

  private async syncAllExchangesPositions(): Promise<void> {
    for (const exchange of exchangesRegistry.getAllExchanges()) {
      try {
        const now = Date.now();
        let count = 0;

        const exchangePos = await exchange.getPositions();
        for (const position of exchangePos) {
          const ref = await Position.findOne({
            where: {
              exchange: position.exchange,
              token: position.token,
              status: PositionStatus.OPEN,
            },
          });
          if (ref) {
            console.log(position);
            await ref.update({
              status: position.status,
              side: position.side,
              size: position.size,
              price: position.price,
              leverage: position.leverage,
              unrealizedPnL: position.unrealizedPnL,
              realizedPnL: position.realizedPnL,
              entryTimestamp: position.entryTimestamp || undefined,
            });
            count += 1;
          }
        }

        // Flag all non updated positions with ERROR status
        await Position.update(
          { status: PositionStatus.ERROR },
          {
            where: { exchange: exchange.name, status: PositionStatus.OPEN, updatedAt: { [Op.lt]: now - 180_000 } },
          },
        );

        console.log(`✅ Syncied ${count} positions from ${exchange.name}`);
      } catch (exchangeError) {
        console.error(`Error fetching ${exchange.name} positions:`, exchangeError);
      }
    }
  }

  /**
   * Synchronise toutes les positions ouvertes avec les exchanges
   */
  public async syncAllPositions(): Promise<JobResult> {
    const startTime = Date.now();

    try {
      console.log("🔄 Starting position synchronization...");

      // Mettre à jour chaque exchange
      await this.syncAllExchangesPositions();

      // Récupérer tous les (delta neutral) trades ouverts
      const openPositions = await TradeHistory.findAll({
        where: { status: "OPEN", side: "DELTA_NEUTRAL" },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "walletAddress"],
          },
        ],
      });

      if (openPositions.length === 0) {
        console.log("✅ No open trade to sync");
        return {
          success: true,
          message: "No open trade to sync",
          executionTime: Date.now() - startTime,
        };
      }

      console.log(`📊 Syncing ${openPositions.length} open positions...`);

      const syncedPositions: string[] = [];
      const failedPositions: { id: string; error: string }[] = [];
      const pnlUpdates: { userId: string; positionPnL: PositionPnL }[] = [];

      // Traiter chaque position
      for (const position of openPositions) {
        try {
          const metrics = await this.getPositionMetrics(position);
          if (metrics) {
            // Mettre à jour la position en DB
            await position.update({
              currentPnL: metrics.currentPnL,
              currentApr: metrics.currentApr,
            });

            syncedPositions.push(position.id);

            // Préparer la mise à jour WebSocket
            const positionPnL: PositionPnL = {
              positionId: position.id,
              currentPnL: metrics.currentPnL,
              currentApr: metrics.currentApr,
              hoursOpen: metrics.hoursOpen,
            };

            pnlUpdates.push({
              userId: position.userId,
              positionPnL,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`Error syncing position ${position.id}:`, error);
          failedPositions.push({ id: position.id, error: errorMessage });
        }
      }

      // Broadcast des mises à jour PnL via WebSocket
      if (pnlUpdates.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers && "handlePositionPnLUpdate" in wsHandlers) {
          pnlUpdates.forEach(({ userId, positionPnL }) => {
            (wsHandlers as any).handlePositionPnLUpdate(userId, positionPnL);
          });
        }
      }

      const executionTime = Date.now() - startTime;
      const result: JobResult = {
        success: syncedPositions.length > 0,
        message: `Synced ${syncedPositions.length} positions, ${failedPositions.length} failed`,
        data: {
          syncedPositions: syncedPositions.length,
          failedPositions: failedPositions.length,
          totalPositions: openPositions.length,
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

      // Calculer le PnL actuel
      const currentPnL = await this.calculatePositionPnL(legs);

      // Calculer l'APR actuel
      const currentApr = await this.calculateCurrentAPR(legs);

      // Calculer les heures d'ouverture
      const hoursOpen = this.calculateHoursOpen(position);

      // Estimer les frais totaux
      // const totalFees = this.calculateTotalFees(position, hoursOpen);

      const metrics = {
        currentApr,
        hoursOpen,
        // totalFees,
        currentPnL,
      };
      console.log(position.token, metrics);
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
        where: { status: "OPEN" },
        // order: [["createdAt", "DESC"]],
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
