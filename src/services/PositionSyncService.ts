import { FundingRate, Position, User } from "../models/index";
import { JobResult, PositionPnL } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { extendedExchange } from "./exchanges/ExtendedExchange";
import { hyperliquidExchange } from "./exchanges/HyperliquidExchange";
import { orderlyExchange } from "./exchanges/OrderlyExchange";
import { vestExchange } from "./exchanges/VestExchange";

interface PositionMetrics {
  currentPnL: number;
  currentAPR: number;
  hoursOpen: number;
  totalFees: number;
  unrealizedPnL: number;
  lastUpdated: Date;
}

// interface UserApiCredentials {
//   apiKey: string;
//   secretKey?: string;
//   passphrase?: string;
// }

export class PositionSyncService {
  private exchanges = {
    vest: vestExchange,
    hyperliquid: hyperliquidExchange,
    orderly: orderlyExchange,
    extended: extendedExchange,
  };

  /**
   * Synchronise toutes les positions ouvertes avec les exchanges
   */
  public async syncAllPositions(): Promise<JobResult> {
    const startTime = Date.now();

    try {
      console.log("🔄 Starting position synchronization...");

      // Récupérer toutes les positions ouvertes
      const openPositions = await Position.findAll({
        where: { status: "OPEN" },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "walletAddress"],
          },
        ],
      });

      if (openPositions.length === 0) {
        console.log("✅ No open positions to sync");
        return {
          success: true,
          message: "No open positions to sync",
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
          const metrics = await this.syncPositionMetrics(position);

          // Mettre à jour la position en DB
          await position.update({
            unrealizedPnL: metrics.unrealizedPnL,
            totalFees: metrics.totalFees,
            hoursOpen: Math.floor(metrics.hoursOpen),
            lastUpdated: new Date(),
          });

          syncedPositions.push(position.id);

          // Préparer la mise à jour WebSocket
          const positionPnL: PositionPnL = {
            positionId: position.id,
            currentPnL: metrics.currentPnL,
            unrealizedPnL: metrics.unrealizedPnL,
            realizedPnL: 0, // TODO: Calculer depuis l'historique
            totalFees: metrics.totalFees,
            currentAPR: metrics.currentAPR,
            hoursOpen: metrics.hoursOpen,
            lastUpdated: metrics.lastUpdated,
          };

          pnlUpdates.push({
            userId: position.userId,
            positionPnL,
          });
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
  public async syncPositionMetrics(position: any): Promise<PositionMetrics> {
    try {
      // Calculer le PnL actuel
      const currentPnL = await this.calculatePositionPnL(position);

      // Calculer l'APR actuel
      const currentAPR = await this.calculateCurrentAPR(position);

      // Calculer les heures d'ouverture
      const hoursOpen = this.calculateHoursOpen(position.createdAt);

      // Estimer les frais totaux
      const totalFees = this.calculateTotalFees(position, hoursOpen);

      // Le PnL non réalisé est généralement le PnL total actuel
      const unrealizedPnL = currentPnL;

      return {
        currentPnL,
        currentAPR,
        hoursOpen,
        totalFees,
        unrealizedPnL,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error(`Error calculating metrics for position ${position.id}:`, error);
      throw error;
    }
  }

  /**
   * Calcule le PnL actuel d'une position
   */
  public async calculatePositionPnL(position: any): Promise<number> {
    try {
      // Récupérer les funding rates actuels
      const longRate = await FundingRate.getLatestForTokenAndExchange(position.longToken, position.longExchange);
      const shortRate = await FundingRate.getLatestForTokenAndExchange(
        position.shortToken || position.longToken,
        position.shortExchange,
      );

      if (!longRate || !shortRate) return 0;

      // Calculer les frais de funding reçus depuis l'ouverture
      const hoursOpen = this.calculateHoursOpen(position.createdAt);
      const fundingFeesReceived = this.calculateFundingFeesReceived(position, longRate, shortRate, hoursOpen);

      // Récupérer le PnL non réalisé depuis les exchanges si disponible
      let unrealizedPnL = 0;
      try {
        const longExchange = this.exchanges[position.longExchange as keyof typeof this.exchanges];
        const shortExchange = this.exchanges[position.shortExchange as keyof typeof this.exchanges];

        if (longExchange && position.longPositionId) {
          unrealizedPnL += await longExchange.getPositionPnL(position.longPositionId);
        }
        if (shortExchange && position.shortPositionId) {
          unrealizedPnL += await shortExchange.getPositionPnL(position.shortPositionId);
        }
      } catch (error) {
        console.warn(`Could not fetch unrealized PnL from exchanges for position ${position.id}:`, error);
      }

      return fundingFeesReceived + unrealizedPnL;
    } catch (error) {
      console.error(`Error calculating PnL for position ${position.id}:`, error);
      return 0;
    }
  }

  /**
   * Calcule l'APR actuel d'une position
   */
  public async calculateCurrentAPR(position: any): Promise<number> {
    try {
      const longRate = await FundingRate.getLatestForTokenAndExchange(position.longToken, position.longExchange);
      const shortRate = await FundingRate.getLatestForTokenAndExchange(
        position.shortToken || position.longToken,
        position.shortExchange,
      );

      if (!longRate || !shortRate) return 0;

      // Calculer le spread APR actuel
      const longApr = (365 * 24 * longRate.fundingRate) / longRate.fundingFrequency;
      const shortApr = (365 * 24 * shortRate.fundingRate) / shortRate.fundingFrequency;
      const spread = shortApr - longApr;

      return spread * 100; // Convertir en pourcentage
    } catch (error) {
      console.error(`Error calculating APR for position ${position.id}:`, error);
      return 0;
    }
  }

  /**
   * Calcule les heures d'ouverture d'une position
   */
  private calculateHoursOpen(createdAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - new Date(createdAt).getTime();
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
      const activePositions = await Position.findAll({
        where: { status: "OPEN" },
        order: [["createdAt", "DESC"]],
      });

      // Enrichir avec les métriques actuelles
      const enrichedPositions = await Promise.all(
        activePositions.map(async (position) => {
          const metrics = await this.syncPositionMetrics(position);

          return {
            ...position.toJSON(),
            currentPnL: metrics.currentPnL,
            currentAPR: metrics.currentAPR,
            hoursOpen: metrics.hoursOpen,
            shouldClose: metrics.currentAPR < position.autoCloseAPRThreshold,
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
