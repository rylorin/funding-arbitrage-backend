import { defaultUserSettings, Position, TradeHistory, User, UserAttributes, UserSettings } from "@/models";
import { PositionSide, PositionStatus } from "@/models/Position";
import { TradeStatus } from "@/models/TradeHistory";
import { default as config, IConfig } from "config";
import { Op } from "sequelize";
import { ExchangesRegistry, exchangesRegistry } from "../exchanges";
import { ExchangeType } from "../exchanges/ExchangeConnector";
import {
  ArbitrageOpportunityData,
  ExchangeName,
  JobResult,
  OrderData,
  PlacedOrderData,
  Service,
  ServiceName,
} from "../types";
import { getWebSocketHandlers } from "../websocket/handlers";
import { opportunityDetectionService } from "./OpportunityDetectionService";
import { positionSyncService } from "./PositionSyncService";

interface TradingResult {
  success: boolean;
  positionId?: string;
  error?: string;
  opportunity: any;
}

export class DeltaNeutralTradingService implements Service {
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
        (o1, o2) => o2.spreadAPR - o1.spreadAPR,
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
  public async closeTrade(position: TradeHistory, reason = "Manual close"): Promise<boolean> {
    try {
      console.log(`🔒 Closing position ${position.token} ${position.id} ${reason}`);

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
        async (p, leg) =>
          p.then(async (success) => {
            const exchange = ExchangesRegistry.getExchange(leg.exchange);
            if (exchange) {
              // console.debug("🧾 Closing leg:", leg);
              const orderData: OrderData = {
                exchange: leg.exchange,
                token: leg.token,
                side: leg.side,
                size: leg.size,
                price: leg.price,
                leverage: 0,
                slippage: leg.slippage,
              };
              return exchange
                .closePosition(orderData)
                .then(async () => leg.update({ status: PositionStatus.CLOSING }))
                .then(() => success)
                .catch((_reason) => false);
            } else {
              return false;
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
          status: [TradeStatus.OPEN, TradeStatus.OPENING],
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
          console.error(`Error checking auto-close for position ${position.token} ${position.id}:`, error);
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
          const success = await this.closeTrade(position, reason);
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

      await this.checkOrphanLegs();

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
  private async checkOrphanLegs() {
    const orphanLegs = await Position.findAll({
      where: {
        status: PositionStatus.OPEN,
      },
      include: [
        {
          model: TradeHistory,
          as: "trade",
          where: {
            status: [TradeStatus.CLOSED, TradeStatus.ERROR],
          },
        },
      ],
    });
    await orphanLegs.reduce(
      async (p, position) =>
        p
          .then(async () => TradeHistory.findByPk(position.tradeId))
          .then((trade) => {
            console.warn(`⚠️ Closing trade #${trade!.id} with orphan legs`);
            return trade;
          })
          .then(async (trade) => this.closeTrade(trade!))
          .then(() => {}),
      Promise.resolve(),
    );
  }

  /**
   * Vérifie si une position doit être fermée automatiquement
   */
  private async checkAutoCloseConditions(position: TradeHistory): Promise<{ shouldClose: boolean; reason: string }> {
    try {
      const legs = await Position.findAll({
        where: {
          tradeId: position.id,
          status: [PositionStatus.OPENING, PositionStatus.OPEN],
        },
      });
      if (legs.length < 2) {
        return { shouldClose: true, reason: "Some legs missing." };
      }
      for (const leg of legs) {
        // Vérifier le seuil de PnL pour chaque jambe
        if (position.autoClosePnLThreshold && leg.cost) {
          const pnl = Math.abs(((leg.unrealizedPnL + leg.realizedPnL) / leg.cost) * 100);
          if (pnl > Math.abs(position.autoClosePnLThreshold))
            return {
              shouldClose: true,
              reason: `Stop loss hit: PnL ${pnl.toFixed(1)}% > ${Math.abs(position.autoClosePnLThreshold)}%`,
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
    user: User,
    opportunities: ArbitrageOpportunityData[],
    settings: UserSettings,
  ): Promise<TradingResult[]> {
    const results: TradingResult[] = [];

    try {
      // Vérifier les positions actives de l'utilisateur
      const activePositions = await TradeHistory.findAll({
        where: {
          userId: user.id,
          status: { [Op.in]: [TradeStatus.OPENING, TradeStatus.OPEN, TradeStatus.CLOSING] },
        },
      });
      const activeLegs = await Position.findAll({
        where: {
          userId: user.id,
          status: { [Op.in]: [TradeStatus.OPENING, TradeStatus.OPEN, TradeStatus.CLOSING] },
        },
      });

      // Filtrer les opportunités selon les settings utilisateur
      const filteredOpportunities = opportunityDetectionService
        .filterByUserSettings(opportunities, settings)
        .sort((a, b) => b.spreadAPR - a.spreadAPR);

      if (filteredOpportunities.length === 0) {
        console.log(`ℹ️ No suitable opportunities for user ${user.id}`);
        return results;
      }

      let activePositionsCount = activePositions.length;
      if (activePositionsCount) {
        console.log(`Actives positions for user ${user.id} (max. ${user.settings.maxSimultaneousPositions}):`);
        activePositions.forEach((item) => console.log(`${item.token}: ${item.exchange} ${item.status}`));
      }

      // Exécuter les trades pour les opportunités filtrées
      for (const opportunity of filteredOpportunities) {
        try {
          if (activePositionsCount >= settings.maxSimultaneousPositions) {
            console.log(`ℹ️ User ${user.id} has reached max positions limit (${settings.maxSimultaneousPositions})`);
            return results;
          }

          // filter out token that already have an active position as multiple positions for the same token/exchange combinaison is unsupported
          if (
            activeLegs.findIndex(
              (leg) =>
                leg.token == opportunity.token &&
                (opportunity.longExchange.name == leg.exchange || opportunity.shortExchange.name == leg.exchange),
            ) !== -1
          ) {
            console.log(
              `ℹ️ User ${user.id} already has an active position for ${opportunity.token} @ ${opportunity.longExchange.name} or ${opportunity.shortExchange.name}`,
            );
            continue;
          }

          console.log(
            `ℹ️ Attempting to open position for user ${user.id} on opportunity: ${opportunity.token} ${opportunity.spreadAPR.toFixed(2)}% APR`,
            // opportunity,
          );
          const tradingResult = await this.executeTrade(user, opportunity, settings);
          results.push(tradingResult);

          if (tradingResult.success) {
            console.log(
              `✅ Successfully opened position for user ${user.id}: ${opportunity.token} ${opportunity.spreadAPR.toFixed(2)}% APR`,
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

  private async openPosition(
    orders: OrderData[],
  ): Promise<{ success: boolean; count: number; orderIds: (PlacedOrderData | undefined)[]; status: string[] }> {
    return await Promise.allSettled(
      orders.map(async (order) => {
        const exchange = exchangesRegistry.getExchange(order.exchange);
        if (!exchange) {
          return Promise.reject(`Exchange ${order.exchange} not found`);
        }
        return exchange.openPosition(order).then((order) => {
          // console.debug(order);
          return order;
        });
      }),
    ).then((results) => {
      return results.reduce(
        (p, result, index) => {
          if (result.status === "fulfilled") {
            const _order = orders[index];
            // console.log(result.value);
            const statusMsg = `✅ Opening ${result.value.side} position @ ${result.value.exchange}: ${result.value.size} ${result.value.token} @ $${result.value.price} (Order ID: ${result.value.orderId})`;
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
   * Adapted to support both spot and perpetual exchanges
   */
  public async executeTrade(
    user: UserAttributes,
    opportunity: ArbitrageOpportunityData,
    settings: UserSettings,
  ): Promise<TradingResult> {
    try {
      console.log(
        `🚀 Executing delta-neutral trade for user ${user.id}: ${settings.maxPositionSize} USD as ${opportunity.token} @ ${opportunity.longExchange.name}/${opportunity.shortExchange.name}`,
      );

      // Get exchanges from registry to check their types
      const longExchange = exchangesRegistry.getExchange(opportunity.longExchange.name);
      const shortExchange = exchangesRegistry.getExchange(opportunity.shortExchange.name);

      if (!longExchange || !shortExchange) {
        throw new Error("One or both exchanges not found in registry");
      }

      const isLongSpot = longExchange.type === ExchangeType.SPOT;
      const isShortSpot = shortExchange.type === ExchangeType.SPOT;

      // Get current prices
      opportunity.longExchange.price = await longExchange.getPrice(opportunity.token);
      opportunity.shortExchange.price = await shortExchange.getPrice(opportunity.token);

      // Calculate individual leg sizes based on exchange types
      const { longSize, shortSize, totalNotional } = this.calculateLegSizes(
        opportunity,
        settings,
        isLongSpot,
        isShortSpot,
      );

      // Calculate average price for trade record
      const price = (opportunity.longExchange.price + opportunity.shortExchange.price) / 2;

      // Enregistrer l'historique des trades
      const trade = await TradeHistory.create({
        userId: user.id,
        exchange: `${opportunity.longExchange.name}/${opportunity.shortExchange.name}` as ExchangeName,
        status: TradeStatus.OPENING,
        token: opportunity.token,
        side: "DELTA_NEUTRAL",
        size: Math.max(longSize, shortSize), // size for record
        price,

        cost: totalNotional,
        currentPnL: 0,
        currentApr: opportunity.spreadAPR,

        autoCloseEnabled: settings.autoCloseEnabled,
        autoCloseAPRThreshold: settings.autoCloseAPRThreshold,
        autoClosePnLThreshold: settings.autoClosePnLThreshold,
        autoCloseTimeoutHours: settings.autoCloseTimeoutHours,

        metadata: {
          ...opportunity,
          isLongSpot,
          isShortSpot,
          longSize,
          shortSize,
        },
      });

      const longOrder: OrderData = {
        exchange: opportunity.longExchange.name,
        token: opportunity.token,
        side: PositionSide.LONG,
        size: longSize,
        price: opportunity.longExchange.price,
        leverage: isLongSpot ? 0 : settings.positionLeverage,
        slippage: settings.slippageTolerance,
      };
      const shortOrder: OrderData = {
        exchange: opportunity.shortExchange.name,
        token: opportunity.token,
        side: PositionSide.SHORT,
        size: shortSize,
        price: opportunity.shortExchange.price,
        leverage: isShortSpot ? 0 : settings.positionLeverage,
        slippage: settings.slippageTolerance,
      };

      const [longLeg, shortLeg] = await Promise.all([
        this.createPositionLeg(
          trade,
          longOrder.side,
          longOrder.exchange,
          longOrder.size,
          longOrder.price,
          longOrder.leverage,
          longOrder.slippage,
        ),
        this.createPositionLeg(
          trade,
          shortOrder.side,
          shortOrder.exchange,
          shortOrder.size,
          shortOrder.price,
          shortOrder.leverage,
          shortOrder.slippage,
        ),
      ]);
      const result = await this.openPosition([
        { ...longOrder, orderId: longLeg.id },
        { ...shortOrder, orderId: shortLeg.id },
      ]);
      result.status.forEach((s) => console.log(s));

      // Update longLeg and shortLeg with actual orderIds from exchanges
      if (result.orderIds[0]?.orderId) {
        await longLeg.update({ orderId: result.orderIds[0].orderId });
      }
      if (result.orderIds[1]?.orderId) {
        await shortLeg.update({ orderId: result.orderIds[1].orderId });
      }

      if (!result.success) {
        console.error("❌ Error placing orders for delta-neutral trade, canceling any pending orders...");
        await Promise.all(result.orderIds.filter((order) => order).map(async (order) => this.cancelOrder(order!)));
      }
      return {
        success: result.success,
        opportunity,
        positionId: trade.id,
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

  async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    const exchange = exchangesRegistry.getExchange(order.exchange);
    if (!exchange) {
      return Promise.reject(`Exchange ${order.exchange} not found`);
    }
    return exchange.cancelOrder(order);
  }

  /**
   * Calcule les tailles des jambes du trade en fonction du type d'exchange
   * Pour les exchanges spot, on calcule des tailles en fonction du prix respectif
   * Pour les exchanges perpetual, on utilise le leverage
   */
  public calculateLegSizes(
    opportunity: ArbitrageOpportunityData,
    settings: UserSettings,
    isLongSpot: boolean,
    isShortSpot: boolean,
  ): { longSize: number; shortSize: number; totalNotional: number } {
    const longPrice = opportunity.longExchange.price;
    const shortPrice = opportunity.shortExchange.price;
    const priceSum = longPrice + shortPrice;
    const avgPrice = priceSum / 2;
    const totalNotional = settings.maxPositionSize;

    if (isShortSpot) {
      // Long en perp, Short en spot
      throw new Error("Spot exchange cannot be used for short position.");
    } else if (isLongSpot) {
      // Long en spot, Short en perp
      const shortNotional = totalNotional / ((settings.positionLeverage || 1) + 1);
      const longNotional = shortNotional * (settings.positionLeverage || 1);

      const longSize = longNotional / longPrice; // Quantité pour spot
      const shortSize = shortNotional / shortPrice; // Quantité pour perp avec leverage

      return {
        longSize,
        shortSize,
        totalNotional,
      };
    } else {
      // Les deux exchanges sont perpetual
      const size = settings.maxPositionSize / avgPrice / 2;

      return {
        longSize: size,
        shortSize: size,
        totalNotional,
      };
    }
  }

  /**
   * Crée une jambe de position avec les paramètres appropriés
   */
  private async createPositionLeg(
    trade: TradeHistory,
    side: PositionSide,
    exchangeName: string,
    size: number,
    price: number,
    leverage: number,
    slippage: number,
  ): Promise<Position> {
    const exchange = exchangesRegistry.getExchange(exchangeName as ExchangeName);
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} not found in registry`);
    }

    const isSpot = exchange.type === ExchangeType.SPOT;

    const leg = await Position.create({
      userId: trade.userId,
      tradeId: trade.id,
      token: trade.token,
      status: PositionStatus.OPENING,
      side,
      entryTimestamp: new Date(),

      exchange: exchangeName as ExchangeName,
      size,
      price,
      leverage: isSpot ? 0 : leverage, // Pas de leverage pour spot
      slippage,

      cost: size * price,
    });

    return await leg.update({ orderId: leg.id });
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
