import { Position, TradeHistory, User } from "../models/index";
import { ExchangeName, JobResult, TokenSymbol } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { extendedExchange } from "./exchanges/ExtendedExchange";
import { hyperliquidExchange } from "./exchanges/HyperliquidExchange";
import { vestExchange } from "./exchanges/VestExchange";
import { woofiExchange } from "./exchanges/WoofiExchange";
import { opportunityDetectionService } from "./OpportunityDetectionService";
import { positionSyncService } from "./PositionSyncService";

interface AutoTradingSettings {
  enabled: boolean;
  minAPR: number;
  maxPositionSize: number;
  maxSimultaneousPositions: number;
  riskTolerance: "LOW" | "MEDIUM" | "HIGH";
  allowedExchanges: ExchangeName[];
  autoCloseEnabled: boolean;
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
}

interface TradingResult {
  success: boolean;
  positionId?: string;
  longOrderId?: string;
  shortOrderId?: string;
  error?: string;
  opportunity: any;
}

export class DeltaNeutralTradingService {
  private isRunning = false;
  private exchanges = {
    vest: vestExchange,
    hyperliquid: hyperliquidExchange,
    orderly: woofiExchange,
    extended: extendedExchange,
  };

  private defaultSettings: AutoTradingSettings = {
    enabled: false, // Désactivé par défaut pour la sécurité
    minAPR: 15, // APR minimum de 15%
    maxPositionSize: 1000, // $1000 max par position
    maxSimultaneousPositions: 3,
    riskTolerance: "MEDIUM",
    allowedExchanges: ["vest", "hyperliquid"],
    autoCloseEnabled: true,
    autoCloseAPRThreshold: 5, // Fermer si APR < 5%
    autoClosePnLThreshold: 100, // Fermer si perte > $100
    autoCloseTimeoutHours: 72, // Fermer après 72h max
  };

  /**
   * Exécute le trading automatique delta-neutral
   */
  public async executeAutoTrading(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return {
        success: false,
        message: "Auto-trading already in progress",
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;
    const tradingResults: TradingResult[] = [];
    const errors: string[] = [];

    try {
      console.log("🤖 Starting delta-neutral auto-trading execution...");

      // Récupérer les utilisateurs avec trading automatique activé
      const autoTradingUsers = await User.findAll({
        where: {
          // Supposons que les utilisateurs ont des settings stockés dans un champ JSON
          // À adapter selon votre schéma réel
        },
      });

      if (autoTradingUsers.length === 0) {
        console.log("ℹ️ No users with auto-trading enabled");
        return {
          success: true,
          message: "No users with auto-trading enabled",
          executionTime: Date.now() - startTime,
        };
      }

      // Trouver les meilleures opportunités
      const opportunities = await opportunityDetectionService.findOpportunities(
        {
          minAPRThreshold: this.defaultSettings.minAPR,
          maxPositionSize: this.defaultSettings.maxPositionSize,
          maxPriceDeviation: 0.5, // 0.5% déviation de prix max
          allowedExchanges: this.defaultSettings.allowedExchanges,
        }
      );

      if (opportunities.length === 0) {
        console.log("ℹ️ No arbitrage opportunities found meeting criteria");
        return {
          success: true,
          message: "No opportunities found",
          executionTime: Date.now() - startTime,
        };
      }

      console.log(`🎯 Found ${opportunities.length} potential opportunities`);

      // Exécuter les trades pour chaque utilisateur éligible
      for (const user of autoTradingUsers) {
        try {
          const userSettings = this.getUserTradingSettings(user);
          if (!userSettings.enabled) continue;

          const userResults = await this.executeUserTrading(
            user,
            opportunities,
            userSettings
          );
          tradingResults.push(...userResults);
        } catch (error) {
          console.error(
            `Error executing auto-trading for user ${user.id}:`,
            error
          );
          errors.push(
            `User ${user.id}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }

      // Broadcast des résultats de trading via WebSocket
      if (tradingResults.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers && "handleAutoTradingUpdate" in wsHandlers) {
          (wsHandlers as any).handleAutoTradingUpdate(tradingResults);
        }
      }

      const executionTime = Date.now() - startTime;
      const result: JobResult = {
        success: tradingResults.some((r) => r.success),
        message: `Auto-trading completed: ${tradingResults.filter((r) => r.success).length} successful trades, ${errors.length} errors`,
        data: {
          opportunitiesFound: opportunities.length,
          tradesExecuted: tradingResults.filter((r) => r.success).length,
          tradingResults,
          errors,
        },
        executionTime,
      };

      if (errors.length > 0) {
        console.log(`⚠️ Auto-trading completed with errors: ${result.message}`);
      } else if (tradingResults.some((r) => r.success)) {
        console.log(
          `✅ Auto-trading completed successfully: ${result.message}`
        );
      } else {
        console.log(`ℹ️ Auto-trading completed: ${result.message}`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Auto-trading failed:", error);

      return {
        success: false,
        message: "Auto-trading failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Ouvre une position delta-neutral
   */
  public async openPosition(
    userId: string,
    opportunity: any,
    size?: number
  ): Promise<TradingResult> {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const settings = this.getUserTradingSettings(user);
      const positionSize =
        size || Math.min(settings.maxPositionSize, opportunity.maxSize);

      return await this.executeTrade(user, opportunity, {
        ...settings,
        maxPositionSize: positionSize,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        opportunity,
      };
    }
  }

  /**
   * Ferme une position delta-neutral
   */
  public async closePosition(
    positionId: string,
    reason: string = "Manual close"
  ): Promise<boolean> {
    try {
      console.log(`🔒 Closing position ${positionId}: ${reason}`);

      const position = await Position.findByPk(positionId);
      if (!position) {
        throw new Error("Position not found");
      }

      const longExchange =
        this.exchanges[position.longExchange as keyof typeof this.exchanges];
      const shortExchange =
        this.exchanges[position.shortExchange as keyof typeof this.exchanges];

      let longClosed = false;
      let shortClosed = false;

      // Fermer la position long
      if (longExchange && position.longPositionId) {
        try {
          longClosed = await longExchange.closePosition(
            position.longPositionId
          );
        } catch (error) {
          console.error(
            `Failed to close long position on ${position.longExchange}:`,
            error
          );
        }
      }

      // Fermer la position short
      if (shortExchange && position.shortPositionId) {
        try {
          shortClosed = await shortExchange.closePosition(
            position.shortPositionId
          );
        } catch (error) {
          console.error(
            `Failed to close short position on ${position.shortExchange}:`,
            error
          );
        }
      }

      // Calculer le PnL final
      const finalPnL = await positionSyncService.calculatePositionPnL(position);

      // Mettre à jour le statut de la position
      await position.update({
        status: longClosed && shortClosed ? "CLOSED" : "ERROR",
        closedAt: new Date(),
        realizedPnL: finalPnL,
        closedReason: reason,
      });

      // Enregistrer l'historique des trades
      await TradeHistory.create({
        userId: position.userId,
        positionId: position.id,
        action: "CLOSE",
        exchange: position.longExchange, // Utiliser l'exchange principal
        token: position.longToken || position.token,
        side: "AUTO_CLOSE",
        size: position.size,
        price: 0,
        fee: 0,
        timestamp: new Date(),
        metadata: { reason, longClosed, shortClosed },
      });

      console.log(
        `${longClosed && shortClosed ? "✅" : "⚠️"} Position ${positionId} close ${longClosed && shortClosed ? "completed" : "partially failed"}`
      );

      return longClosed && shortClosed;
    } catch (error) {
      console.error(`Error closing position ${positionId}:`, error);
      return false;
    }
  }

  /**
   * Surveille et ferme automatiquement les positions si nécessaire
   */
  public async monitorAndAutoClose(): Promise<JobResult> {
    const startTime = Date.now();

    try {
      console.log("🔍 Starting auto-close monitoring...");

      // Récupérer les positions ouvertes avec auto-close activé
      const openPositions = await Position.findAll({
        where: {
          status: "OPEN",
          autoCloseEnabled: true,
        },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "walletAddress"],
          },
        ],
      });

      if (openPositions.length === 0) {
        return {
          success: true,
          message: "No positions to monitor for auto-close",
          executionTime: Date.now() - startTime,
        };
      }

      console.log(
        `📊 Monitoring ${openPositions.length} positions for auto-close...`
      );

      const positionsToClose: { position: any; reason: string }[] = [];

      // Vérifier chaque position
      for (const position of openPositions) {
        try {
          const shouldClose = await this.checkAutoCloseConditions(position);
          if (shouldClose.shouldClose) {
            positionsToClose.push({ position, reason: shouldClose.reason });
          }
        } catch (error) {
          console.error(
            `Error checking auto-close for position ${position.id}:`,
            error
          );
        }
      }

      // Fermer les positions identifiées
      const closeResults: {
        positionId: string;
        success: boolean;
        reason: string;
      }[] = [];

      for (const { position, reason } of positionsToClose) {
        try {
          const success = await this.closePosition(position.id, reason);
          closeResults.push({ positionId: position.id, success, reason });

          // Notification WebSocket
          const wsHandlers = getWebSocketHandlers();
          if (wsHandlers) {
            wsHandlers.handlePositionClosed(
              position.userId,
              position.id,
              reason,
              position.currentPnl
            );
          }
        } catch (error) {
          console.error(`Error auto-closing position ${position.id}:`, error);
          closeResults.push({
            positionId: position.id,
            success: false,
            reason,
          });
        }
      }

      const executionTime = Date.now() - startTime;
      const successfulCloses = closeResults.filter((r) => r.success).length;

      const result: JobResult = {
        success: true,
        message: `Auto-close monitoring completed: ${successfulCloses}/${positionsToClose.length} positions closed`,
        data: {
          positionsMonitored: openPositions.length,
          positionsClosed: successfulCloses,
          closeResults,
        },
        executionTime,
      };

      console.log(
        `✅ Auto-close monitoring completed: ${result.message} (${executionTime}ms)`
      );

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Auto-close monitoring failed:", error);

      return {
        success: false,
        message: "Auto-close monitoring failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    }
  }

  /**
   * Vérifie si une position doit être fermée automatiquement
   */
  private async checkAutoCloseConditions(
    position: any
  ): Promise<{ shouldClose: boolean; reason: string }> {
    try {
      const metrics = await positionSyncService.syncPositionMetrics(position);
      const hoursOpen = metrics.hoursOpen;

      // Vérifier le seuil de PnL
      if (
        position.autoClosePnLThreshold &&
        metrics.currentPnL <= -Math.abs(position.autoClosePnLThreshold)
      ) {
        return {
          shouldClose: true,
          reason: `Stop loss hit: PnL ${metrics.currentPnL.toFixed(2)} <= -$${Math.abs(position.autoClosePnLThreshold)}`,
        };
      }

      // Vérifier le seuil d'APR
      if (
        position.autoCloseAPRThreshold &&
        metrics.currentAPR < position.autoCloseAPRThreshold
      ) {
        return {
          shouldClose: true,
          reason: `APR below threshold: ${metrics.currentAPR.toFixed(2)}% < ${position.autoCloseAPRThreshold}%`,
        };
      }

      // Vérifier le timeout
      if (
        position.autoCloseTimeoutHours &&
        hoursOpen >= position.autoCloseTimeoutHours
      ) {
        return {
          shouldClose: true,
          reason: `Position timeout: ${hoursOpen.toFixed(1)}h >= ${position.autoCloseTimeoutHours}h`,
        };
      }

      return { shouldClose: false, reason: "" };
    } catch (error) {
      console.error("Error checking auto-close conditions:", error);
      return { shouldClose: false, reason: "" };
    }
  }

  /**
   * Exécute le trading pour un utilisateur spécifique
   */
  private async executeUserTrading(
    user: any,
    opportunities: any[],
    settings: AutoTradingSettings
  ): Promise<TradingResult[]> {
    const results: TradingResult[] = [];

    try {
      // Vérifier les positions actives de l'utilisateur
      const activePositions = await Position.count({
        where: {
          userId: user.id,
          status: "OPEN",
        },
      });

      if (activePositions >= settings.maxSimultaneousPositions) {
        console.log(
          `User ${user.id} has reached max positions limit (${settings.maxSimultaneousPositions})`
        );
        return results;
      }

      // Filtrer les opportunités selon les settings utilisateur
      const filteredOpportunities = opportunityDetectionService
        .filterByUserSettings(opportunities, {
          minAPR: settings.minAPR,
          maxPositionSize: settings.maxPositionSize,
          riskTolerance: settings.riskTolerance as "LOW" | "MEDIUM" | "HIGH",
          allowedExchanges: settings.allowedExchanges,
        })
        .slice(0, settings.maxSimultaneousPositions - activePositions);

      if (filteredOpportunities.length === 0) {
        console.log(`No suitable opportunities for user ${user.id}`);
        return results;
      }

      // Exécuter les trades pour les opportunités filtrées
      for (const opportunity of filteredOpportunities) {
        try {
          const tradingResult = await this.executeTrade(
            user,
            opportunity,
            settings
          );
          results.push(tradingResult);

          if (tradingResult.success) {
            console.log(
              `✅ Successfully opened position for user ${user.id}: ${opportunity.token} ${opportunity.spreadAPR.toFixed(2)}% APR`
            );
          } else {
            console.log(
              `❌ Failed to open position for user ${user.id}: ${tradingResult.error}`
            );
          }
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            opportunity,
          });
        }
      }
    } catch (error) {
      console.error(`Error executing trading for user ${user.id}:`, error);
    }

    return results;
  }

  /**
   * Exécute un trade delta-neutral
   */
  private async executeTrade(
    user: any,
    opportunity: any,
    settings: AutoTradingSettings
  ): Promise<TradingResult> {
    try {
      const longExchange =
        this.exchanges[opportunity.longExchange as keyof typeof this.exchanges];
      const shortExchange =
        this.exchanges[
          opportunity.shortExchange as keyof typeof this.exchanges
        ];

      if (!longExchange || !shortExchange) {
        throw new Error(
          `Exchange not available: ${opportunity.longExchange} or ${opportunity.shortExchange}`
        );
      }

      // Calculer la taille de la position
      const positionSize = Math.min(
        settings.maxPositionSize,
        opportunity.maxSize
      );

      console.log(
        `🚀 Executing delta-neutral trade for ${user.id}: ${opportunity.token} Long(${opportunity.longExchange}) Short(${opportunity.shortExchange}) Size: $${positionSize}`
      );

      // Ouvrir la position long
      const longOrderId = await longExchange.openPosition(
        opportunity.token as TokenSymbol,
        "long",
        positionSize
      );

      // Ouvrir la position short
      const shortOrderId = await shortExchange.openPosition(
        opportunity.token as TokenSymbol,
        "short",
        positionSize
      );

      // Créer l'enregistrement de position
      const position = await Position.create({
        userId: user.id,
        token: opportunity.token,
        longToken: opportunity.token,
        shortToken: opportunity.token,
        longExchange: opportunity.longExchange,
        shortExchange: opportunity.shortExchange,
        longPositionId: longOrderId,
        shortPositionId: shortOrderId,
        size: positionSize,
        entryTimestamp: new Date(),
        entryFundingRates: {
          longRate: opportunity.longFundingRate,
          shortRate: opportunity.shortFundingRate,
          spreadAPR: opportunity.spreadAPR,
        },
        entrySpreadAPR: opportunity.spreadAPR,
        longFundingRate: opportunity.longFundingRate,
        shortFundingRate: opportunity.shortFundingRate,
        longMarkPrice: opportunity.longMarkPrice,
        shortMarkPrice: opportunity.shortMarkPrice,
        currentPnl: 0,
        status: "OPEN",
        autoCloseEnabled: settings.autoCloseEnabled,
        autoCloseAPRThreshold: settings.autoCloseAPRThreshold,
        autoClosePnLThreshold: settings.autoClosePnLThreshold,
        autoCloseTimeoutHours: settings.autoCloseTimeoutHours,
      });

      // Enregistrer l'historique des trades
      await TradeHistory.create({
        userId: user.id,
        positionId: position.id,
        action: "OPEN",
        exchange: opportunity.longExchange, // Utiliser l'exchange principal
        token: opportunity.token,
        side: "DELTA_NEUTRAL",
        size: positionSize,
        price: (opportunity.longMarkPrice + opportunity.shortMarkPrice) / 2,
        fee: 0, // À mettre à jour avec les frais réels
        timestamp: new Date(),
        metadata: {
          longExchange: opportunity.longExchange,
          shortExchange: opportunity.shortExchange,
          longOrderId,
          shortOrderId,
          expectedAPR: opportunity.spreadAPR,
        },
      });

      return {
        success: true,
        positionId: position.id,
        longOrderId,
        shortOrderId,
        opportunity,
      };
    } catch (error) {
      console.error("Error executing delta-neutral trade:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        opportunity,
      };
    }
  }

  /**
   * Récupère les settings de trading d'un utilisateur
   */
  private getUserTradingSettings(_user: any): AutoTradingSettings {
    // En implémentation réelle, ceci récupérerait les settings spécifiques de l'utilisateur depuis la DB
    return {
      ...this.defaultSettings,
      // Override avec les settings utilisateur si disponibles
      // ...user.autoTradingSettings
    };
  }

  /**
   * Méthode utilitaire pour exécuter une fois
   */
  public async runOnce(): Promise<JobResult> {
    return await this.executeAutoTrading();
  }
}

export const deltaNeutralTradingService = new DeltaNeutralTradingService();
