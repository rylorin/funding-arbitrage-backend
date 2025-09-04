import { Response } from 'express';
import { Op } from 'sequelize';
import Joi from 'joi';
import { AuthenticatedRequest } from '../middleware/auth';
import { Position, TradeHistory, FundingRate } from '../models/index';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      period: Joi.string().valid('24h', '7d', '30d', '90d').default('30d'),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: 'Query validation error',
        details: error.details,
      });
      return;
    }

    const { period } = value;
    
    // Calculate date range based on period
    const now = new Date();
    const periodHours: { [key: string]: number } = {
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30,
      '90d': 24 * 90,
    };
    
    const startDate = new Date(now.getTime() - (periodHours[period] * 60 * 60 * 1000));

    // Get user positions
    const [totalPositions, openPositions, closedPositions] = await Promise.all([
      Position.count({ where: { userId: req.user!.id } }),
      Position.count({ where: { userId: req.user!.id, status: 'OPEN' } }),
      Position.count({ 
        where: { 
          userId: req.user!.id, 
          status: 'CLOSED',
          closedAt: { [Op.gte]: startDate }
        } 
      }),
    ]);

    // Get trading volume and fees
    const trades = await TradeHistory.findAll({
      where: {
        userId: req.user!.id,
        timestamp: { [Op.gte]: startDate },
      },
    });

    const tradingVolume = trades.reduce((total, trade) => total + (trade.size * trade.price), 0);
    const totalFees = trades.reduce((total, trade) => total + trade.fee, 0);

    // Get current PnL from open positions
    const openPositionsData = await Position.findAll({
      where: {
        userId: req.user!.id,
        status: 'OPEN',
      },
    });

    const currentPnL = openPositionsData.reduce((total, position) => total + position.currentPnl, 0);
    const totalSize = openPositionsData.reduce((total, position) => total + position.size, 0);

    // Get realized PnL from closed positions
    const closedPositionsData = await Position.findAll({
      where: {
        userId: req.user!.id,
        status: 'CLOSED',
        closedAt: { [Op.gte]: startDate },
      },
    });

    const realizedPnL = closedPositionsData.reduce((total, position) => total + position.currentPnl, 0);

    // Calculate performance metrics
    const totalPnL = currentPnL + realizedPnL;
    const roi = tradingVolume > 0 ? (totalPnL / tradingVolume) * 100 : 0;

    // Get best performing token
    const tokenPerformance: { [key: string]: { pnl: number; count: number } } = {};
    [...openPositionsData, ...closedPositionsData].forEach(position => {
      if (!tokenPerformance[position.token]) {
        tokenPerformance[position.token] = { pnl: 0, count: 0 };
      }
      tokenPerformance[position.token].pnl += position.currentPnl;
      tokenPerformance[position.token].count += 1;
    });

    const bestToken = Object.keys(tokenPerformance).reduce((best, token) => {
      return !best || tokenPerformance[token].pnl > tokenPerformance[best].pnl ? token : best;
    }, '');

    res.json({
      period,
      stats: {
        positions: {
          total: totalPositions,
          open: openPositions,
          closed: closedPositions,
        },
        trading: {
          volume: Number(tradingVolume.toFixed(2)),
          fees: Number(totalFees.toFixed(2)),
          tradeCount: trades.length,
        },
        performance: {
          currentPnL: Number(currentPnL.toFixed(2)),
          realizedPnL: Number(realizedPnL.toFixed(2)),
          totalPnL: Number(totalPnL.toFixed(2)),
          roi: Number(roi.toFixed(2)),
          totalSize: Number(totalSize.toFixed(2)),
        },
        insights: {
          bestToken,
          bestTokenPnL: bestToken ? Number(tokenPerformance[bestToken].pnl.toFixed(2)) : 0,
          activeExchanges: [...new Set([...openPositionsData.map(p => p.longExchange), ...openPositionsData.map(p => p.shortExchange)])],
        },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPerformanceChart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      period: Joi.string().valid('24h', '7d', '30d', '90d').default('7d'),
      granularity: Joi.string().valid('1h', '4h', '1d').default('1d'),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: 'Query validation error',
        details: error.details,
      });
      return;
    }

    const { period, granularity } = value;
    
    // Calculate date range
    const now = new Date();
    const periodHours: { [key: string]: number } = {
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30,
      '90d': 24 * 90,
    };
    
    const granularityHours: { [key: string]: number } = {
      '1h': 1,
      '4h': 4,
      '1d': 24,
    };

    const startDate = new Date(now.getTime() - (periodHours[period] * 60 * 60 * 1000));
    const interval = granularityHours[granularity] * 60 * 60 * 1000;
    
    // Generate time buckets
    const buckets: { timestamp: Date; pnl: number; volume: number }[] = [];
    for (let time = startDate.getTime(); time <= now.getTime(); time += interval) {
      buckets.push({
        timestamp: new Date(time),
        pnl: 0,
        volume: 0,
      });
    }

    // Get all user trades and positions in the period
    const [trades, positions] = await Promise.all([
      TradeHistory.findAll({
        where: {
          userId: req.user!.id,
          timestamp: { [Op.gte]: startDate },
        },
        order: [['timestamp', 'ASC']],
      }),
      Position.findAll({
        where: {
          userId: req.user!.id,
          createdAt: { [Op.gte]: startDate },
        },
        order: [['createdAt', 'ASC']],
      }),
    ]);

    // Populate buckets with data
    let cumulativePnL = 0;

    trades.forEach(trade => {
      const tradeTime = trade.timestamp.getTime();
      const bucketIndex = Math.floor((tradeTime - startDate.getTime()) / interval);
      
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].volume += trade.size * trade.price;
      }
    });

    positions.forEach(position => {
      const positionTime = position.createdAt.getTime();
      const bucketIndex = Math.floor((positionTime - startDate.getTime()) / interval);
      
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        cumulativePnL += position.currentPnl;
        // Distribute PnL across remaining buckets
        for (let i = bucketIndex; i < buckets.length; i++) {
          buckets[i].pnl = cumulativePnL;
        }
      }
    });

    res.json({
      period,
      granularity,
      data: buckets.map(bucket => ({
        timestamp: bucket.timestamp,
        pnl: Number(bucket.pnl.toFixed(2)),
        volume: Number(bucket.volume.toFixed(2)),
      })),
    });
  } catch (error) {
    console.error('Performance chart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTopOpportunities = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      limit: Joi.number().integer().min(1).max(20).default(5),
      minAPR: Joi.number().min(0).default(10),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: 'Query validation error',
        details: error.details,
      });
      return;
    }

    const { limit, minAPR } = value;

    // Get latest funding rates
    const rates = await FundingRate.findAll({
      where: {
        timestamp: {
          [Op.gte]: new Date(Date.now() - 2 * 60 * 60 * 1000), // Last 2 hours
        },
      },
      order: [['timestamp', 'DESC']],
    });

    // Group by token and get the latest rate for each exchange
    const latestRates: { [key: string]: { [key: string]: any } } = {};
    rates.forEach(rate => {
      if (!latestRates[rate.token]) {
        latestRates[rate.token] = {};
      }
      if (!latestRates[rate.token][rate.exchange] || 
          rate.timestamp > latestRates[rate.token][rate.exchange].timestamp) {
        latestRates[rate.token][rate.exchange] = rate;
      }
    });

    // Calculate opportunities
    const opportunities: any[] = [];
    Object.keys(latestRates).forEach(token => {
      const tokenRates = Object.values(latestRates[token]);
      if (tokenRates.length < 2) return;

      tokenRates.sort((a: any, b: any) => a.fundingRate - b.fundingRate);

      for (let i = 0; i < tokenRates.length - 1; i++) {
        for (let j = i + 1; j < tokenRates.length; j++) {
          const longRate = tokenRates[i];
          const shortRate = tokenRates[j];
          
          const spreadAPR = ((shortRate.fundingRate - longRate.fundingRate) * 8760) * 100;
          
          if (spreadAPR >= minAPR) {
            opportunities.push({
              token,
              longExchange: longRate.exchange,
              shortExchange: shortRate.exchange,
              longFundingRate: longRate.fundingRate,
              shortFundingRate: shortRate.fundingRate,
              spreadAPR: Number(spreadAPR.toFixed(2)),
              confidence: Math.min(95, 50 + (spreadAPR * 2)),
              updatedAt: Math.max(longRate.timestamp, shortRate.timestamp),
            });
          }
        }
      }
    });

    // Sort by APR and limit
    opportunities.sort((a, b) => b.spreadAPR - a.spreadAPR);
    const topOpportunities = opportunities.slice(0, limit);

    res.json({
      opportunities: topOpportunities,
      count: topOpportunities.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Top opportunities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};