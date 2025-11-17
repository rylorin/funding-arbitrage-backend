import { PositionSide, PositionStatus } from "@/models/Position";
import { TradeStatus } from "@/models/TradeHistory";
import { defaultUserSettings, UserSettings } from "@/models/User";
import { default as config, IConfig } from "config";
import { Op } from "sequelize";
import { ExchangesRegistry, exchangesRegistry } from "../exchanges";
import { Position, TradeHistory, User } from "../models/index";
import {
  ArbitrageOpportunityData,
  ExchangeName,
  JobResult,
  OrderData,
  PlacedOrderData,
  ServiceName,
} from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { opportunityDetectionService } from "./OpportunityDetectionService";
import { positionSyncService } from "./PositionSyncService";

interface TradingResult {
  success: boolean;
  positionId?: string;
  error?: string;
  opportunity: any;
}

export class DeltaNeutralTradingService {
  public readonly name: ServiceName = ServiceName.DELTA_NEUTRAL;
  public readonly config: IConfig;
  private isRunning = false;

  constructor() {
    this.config = config.get("services." + this.name);
  }

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
      const opportunities = (await opportunityDetectionService.findOpportunities()).sort(
        (o1, o2) => o2.spread.apr - o1.spread.apr,
      );

      if (opportunities.length === 0) {
        console.log("ℹ️ No arbitrage opportunities found meeting criteria");
        return {
          success: true,
          message: "No opportunities found",
          executionTime: Date.now() - startTime,
        };
      }

      // Exécuter les trades pour chaque utilisateur éligible
      for (const user of autoTradingUsers) {
        try {
          const userSettings = this.getUserTradingSettings(user);
          if (!userSettings.enabled) continue;

          console.log(`🎯 Found ${opportunities.length} potential opportunities`);

          const userResults = await this.executeUserTrading(user, opportunities, userSettings);
          tradingResults.push(...userResults);
        } catch (error) {
          console.error(`Error executing auto-trading for user ${user.id}:`, error);
          errors.push(`User ${user.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
          // opportunitiesFound: opportunities.length,
          tradesExecuted: tradingResults.filter((r) => r.success).length,
          tradingResults,
          errors,
        },
        executionTime,
      };

      if (errors.length > 0) {
        console.log(`⚠️ Auto-trading completed with errors: ${result.message}`);
      } else if (tradingResults.some((r) => r.success)) {
        console.log(`✅ Auto-trading completed successfully: ${result.message}`);
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
   * Ferme une position delta-neutral
   */
  public async closePosition(position: TradeHistory, reason = "Manual close"): Promise<boolean> {
    try {
      console.log(`🔒 Closing position ${position.id}: ${reason}`);

      const legs = await Position.findAll({
        where: {
          tradeId: position.id,
          status: PositionStatus.OPEN,
        },
        include: [
          {
            model: User,
            as: "user",
          },
        ],
      });
      const user = await User.findByPk(position.userId);
      const userSettings = this.getUserTradingSettings(user || undefined);

      const success = await legs.reduce(
        (p, leg) =>
          p.then((success) => {
            const exchange = ExchangesRegistry.getExchange(leg.exchange);
            if (exchange) {
              const orderData: OrderData = {
                exchange: exchange.name,
                token: leg.token,
                side: leg.side == PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG,
                size: leg.size,
                price: leg.price,
                leverage: 0,
                slippage: userSettings.slippageTolerance,
              };
              return exchange
                .closePosition(orderData)
                .then(() => leg.update({ status: PositionStatus.CLOSING }))
                .then(() => success)
                .catch((_reason) => false);
            } else {
              return success;
            }
          }),
        Promise.resolve(true),
      );

      // Mettre à jour le statut de la position
      await position.update({
        status: TradeStatus.CLOSING,
        // closedAt: new Date(),
        closedReason: reason,
      });

      console.log(`${success ? "✅" : "⚠️"} Position ${position.id} closing: ${reason}`);

      return success;
    } catch (error) {
      console.error(`Error closing position ${position.id}:`, error);
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
      const openPositions = await TradeHistory.findAll({
        where: {
          status: "OPEN",
          autoCloseEnabled: true,
          createdAt: { [Op.lt]: startTime - this.config.get<number>("graceDelay") * 1_000 },
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

      console.log(`📊 Monitoring ${openPositions.length} positions for auto-close...`);

      const positionsToClose: { position: TradeHistory; reason: string }[] = [];

      // Vérifier chaque position
      for (const position of openPositions) {
        try {
          const shouldClose = await this.checkAutoCloseConditions(position);
          if (shouldClose.shouldClose) {
            positionsToClose.push({ position, reason: shouldClose.reason });
          }
        } catch (error) {
          console.error(`Error checking auto-close for position ${position.id}:`, error);
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
          const success = await this.closePosition(position, reason);
          closeResults.push({ positionId: position.id, success, reason });

          // Notification WebSocket
          const wsHandlers = getWebSocketHandlers();
          if (wsHandlers) {
            wsHandlers.handlePositionClosed(position.userId, position.id, reason, 0);
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

      await this.checkClosingTrades();

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

      console.log(`✅ Auto-close monitoring completed: ${result.message} (${executionTime}ms)`);

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
  private async checkClosingTrades() {
    const closingTrades = await TradeHistory.findAll({
      where: {
        status: "CLOSING",
      },
    });
    for (const position of closingTrades) {
      const legs = await Position.findAll({
        where: {
          tradeId: position.id,
          status: PositionStatus.OPEN,
        },
      });

      if (legs.length == 0) await position.update({ status: TradeStatus.CLOSE });
    }
  }

  /**
   * Vérifie si une position doit être fermée automatiquement
   */
  private async checkAutoCloseConditions(position: TradeHistory): Promise<{ shouldClose: boolean; reason: string }> {
    try {
      const legs = await Position.findAll({
        where: {
          tradeId: position.id,
          status: PositionStatus.OPEN,
        },
      });
      if (legs.length < 2) {
        return { shouldClose: true, reason: "Some legs missing." };
      }
      for (const leg of legs) {
        // Vérifier le seuil de PnL
        if (
          position.autoClosePnLThreshold != null &&
          leg.unrealizedPnL <= -(Math.abs(position.autoClosePnLThreshold / 100) * position.size * position.price)
        ) {
          return {
            shouldClose: true,
            reason: `Stop loss hit: PnL ${leg.unrealizedPnL.toFixed(2)} <= -$${Math.abs(position.autoClosePnLThreshold)}`,
          };
        }
      }

      const metrics = await positionSyncService.getPositionMetrics(position);
      if (metrics) {
        // Vérifier le seuil d'APR
        if (position.autoCloseAPRThreshold != null && metrics.currentApr < position.autoCloseAPRThreshold) {
          return {
            shouldClose: true,
            reason: `APR below threshold: ${metrics.currentApr.toFixed(2)}% < ${position.autoCloseAPRThreshold}%`,
          };
        }

        // Vérifier le timeout
        if (position.autoCloseTimeoutHours && metrics.hoursOpen >= position.autoCloseTimeoutHours) {
          return {
            shouldClose: true,
            reason: `Position timeout: ${metrics.hoursOpen.toFixed(1)}h >= ${position.autoCloseTimeoutHours}h`,
          };
        }
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
    opportunities: ArbitrageOpportunityData[],
    settings: UserSettings,
  ): Promise<TradingResult[]> {
    const results: TradingResult[] = [];

    try {
      // Vérifier les positions actives de l'utilisateur
      const activePositions = await TradeHistory.findAll({
        where: {
          userId: user.id,
          status: "OPEN",
        },
      });
      let activePositionsCount = activePositions.length;

      // Filtrer les opportunités selon les settings utilisateur
      const filteredOpportunities = opportunityDetectionService
        .filterByUserSettings(opportunities, {
          minAPR: settings.minAPR,
          maxPositionSize: settings.maxPositionSize,
          riskTolerance: settings.riskTolerance,
          allowedExchanges: settings.preferredExchanges,
        })
        // filter out token that already have an active position as multiple positions for the same token is unsupported
        .filter((opportunity) => activePositions.findIndex((pos) => pos.token == opportunity.token) == -1);

      if (filteredOpportunities.length === 0) {
        console.log(`ℹ️ No suitable opportunities for user ${user.id}`);
        console.log(settings);
        // console.log( opportunities);
        return results;
      }

      // Exécuter les trades pour les opportunités filtrées
      for (const opportunity of filteredOpportunities) {
        try {
          if (activePositionsCount >= settings.maxSimultaneousPositions) {
            console.log(`ℹ️ User ${user.id} has reached max positions limit (${settings.maxSimultaneousPositions})`);
            return results;
          }

          console.log(
            `ℹ️ Attempting to open position for user ${user.id} on opportunity: ${opportunity.token} ${opportunity.spread.apr.toFixed(2)}% APR`,
            // opportunity,
          );
          const tradingResult = await this.executeTrade(user, opportunity, settings);
          results.push(tradingResult);

          if (tradingResult.success) {
            console.log(
              `✅ Successfully opened position for user ${user.id}: ${opportunity.token} ${opportunity.spread.apr.toFixed(2)}% APR`,
            );
            activePositionsCount += 1;
          } else {
            console.log(`❌ Failed to open position for user ${user.id}: ${tradingResult.error}`);
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

  private async placeOrders(
    orders: OrderData[],
  ): Promise<{ success: boolean; count: number; orderIds: (PlacedOrderData | undefined)[]; status: string[] }> {
    return await Promise.allSettled(
      orders.map((order) => {
        const exchange = exchangesRegistry.getExchange(order.exchange);
        if (!exchange) {
          return Promise.reject(`Exchange ${order.exchange} not found`);
        }
        return exchange.openPosition(order);
      }),
    ).then((results) => {
      return results.reduce(
        (p, result, index) => {
          if (result.status === "fulfilled") {
            const order = orders[index];
            const statusMsg = `✅ Opened ${result.value.side} position on ${result.value.exchange} for ${result.value.token} Size: ${result.value.size} at $${result.value.price} (Order ID: ${result.value.orderId})`;
            p.count += 1;
            p.orderIds.push(result.value);
            p.status.push(statusMsg);
          } else {
            const order = orders[index];
            const statusMsg = `❌ Error opening ${order.side} position on ${order.exchange}: ${result.reason.message || result.reason}`;
            p.success = false;
            p.orderIds.push(undefined);
            p.status.push(statusMsg);
          }
          return p;
        },
        { success: true, count: 0, orderIds: [], status: [] } as {
          success: boolean;
          count: number;
          orderIds: (PlacedOrderData | undefined)[];
          status: string[];
        },
      );
    });
  }

  /**
   * Exécute un trade delta-neutral
   */
  private async executeTrade(
    user: any,
    opportunity: ArbitrageOpportunityData,
    settings: UserSettings,
  ): Promise<TradingResult> {
    try {
      const price = (opportunity.longExchange.price + opportunity.shortExchange.price) / 2;
      const size = settings.maxPositionSize / price;

      console.log(
        `🚀 Executing delta-neutral trade for ${user.id}: ${opportunity.token} Long(${opportunity.longExchange.name}) Short(${opportunity.shortExchange.name}) Size: ${size} @ $${price}`,
      );
      const longOrder: OrderData = {
        exchange: opportunity.longExchange.name,
        token: opportunity.token,
        side: PositionSide.LONG,
        price: opportunity.longExchange.price,
        size,
        leverage: settings.positionLeverage,
        slippage: settings.slippageTolerance,
      };
      const shortOrder: OrderData = {
        exchange: opportunity.shortExchange.name,
        token: opportunity.token,
        side: PositionSide.SHORT,
        price: opportunity.shortExchange.price,
        size,
        leverage: settings.positionLeverage,
        slippage: settings.slippageTolerance,
      };
      const result = await this.placeOrders([longOrder, shortOrder]);
      result.status.forEach((s) => console.log(s));
      if (result.count > 0) {
        // Enregistrer l'historique des trades
        const trade = await TradeHistory.create({
          userId: user.id,
          exchange: `${opportunity.longExchange.name}/${opportunity.shortExchange.name}` as ExchangeName,
          status: TradeStatus.OPEN,
          token: opportunity.token,
          side: "DELTA_NEUTRAL",
          size,
          price,

          currentPnL: 0,
          currentApr: opportunity.spread.apr,

          autoCloseEnabled: settings.autoCloseEnabled,
          autoCloseAPRThreshold: settings.autoCloseAPRThreshold,
          autoClosePnLThreshold: settings.autoClosePnLThreshold,
          autoCloseTimeoutHours: settings.autoCloseTimeoutHours,

          metadata: opportunity,
        });

        await result.orderIds.forEach(async (order, i) => {
          if (order) {
            await Position.create({
              userId: user.id,
              tradeId: trade.id,
              token: opportunity.token,
              status: PositionStatus.OPEN,
              side: i == 0 ? PositionSide.LONG : PositionSide.SHORT,
              entryTimestamp: new Date(),

              exchange: order.exchange,
              size: order.size,
              price: order.price,
              leverage: order.leverage,
              slippage: order.slippage,
              orderId: order.orderId,
            });
          }
        });

        if (!result.success) {
          // cancel all openend orders
          await result.orderIds
            .filter((order) => order)
            .forEach(async (order) => {
              try {
                return await this.cancelOrder(order!).then();
              } catch (error) {
                console.error(`❌ Failed to cancel order ${order?.orderId}: ${error}`);
              }
            });
        }

        return {
          success: result.success,
          opportunity,
          positionId: trade.id,
        };
      } else {
        // to be implemented: order cancellation logic here if one order succeeded and the other failed
        console.error("❌ Error placing orders for delta-neutral trade");
      }

      return {
        success: result.success,
        opportunity,
      };
    } catch (error) {
      console.error("❌ Error executing delta-neutral trade:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        opportunity,
      };
    }
  }

  cancelOrder(order: PlacedOrderData): Promise<boolean> {
    const exchange = exchangesRegistry.getExchange(order.exchange);
    if (!exchange) {
      return Promise.reject(`Exchange ${order.exchange} not found`);
    }
    return exchange.cancelOrder(order);
  }

  /**
   * Récupère les settings de trading d'un utilisateur
   */
  private getUserTradingSettings(user?: User): UserSettings {
    // En implémentation réelle, ceci récupérerait les settings spécifiques de l'utilisateur depuis la DB
    return {
      ...defaultUserSettings,
      // Override avec les settings utilisateur si disponibles
      ...user?.settings,
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
