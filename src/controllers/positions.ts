import { Response } from 'express';
import Joi from 'joi';
import { AuthenticatedRequest } from '../middleware/auth';
import { Position, User } from '../models/index';

const createPositionSchema = Joi.object({
  token: Joi.string().valid('BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP').required(),
  longExchange: Joi.string().valid('vest', 'hyperliquid', 'orderly', 'extended', 'paradex', 'backpack', 'hibachi').required(),
  shortExchange: Joi.string().valid('vest', 'hyperliquid', 'orderly', 'extended', 'paradex', 'backpack', 'hibachi').required(),
  size: Joi.number().positive().required(),
  entryFundingRates: Joi.object({
    longRate: Joi.number().required(),
    shortRate: Joi.number().required(),
    spreadAPR: Joi.number().required(),
  }).required(),
  autoCloseEnabled: Joi.boolean().default(true),
  autoCloseAPRThreshold: Joi.number().min(0).max(100).optional(),
  autoClosePnLThreshold: Joi.number().min(-100).max(0).optional(),
}).custom((value, helpers) => {
  if (value.longExchange === value.shortExchange) {
    return helpers.error('custom.sameExchange');
  }
  return value;
}).messages({
  'custom.sameExchange': 'Long and short exchanges must be different',
});

export const createPosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { error, value } = createPositionSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation error',
        details: error.details,
      });
      return;
    }

    const {
      token,
      longExchange,
      shortExchange,
      size,
      entryFundingRates,
      autoCloseEnabled,
      autoCloseAPRThreshold,
      autoClosePnLThreshold,
    } = value;

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Use user settings as defaults if not provided
    const finalAPRThreshold = autoCloseAPRThreshold || user.settings.autoCloseAPRThreshold;
    const finalPnLThreshold = autoClosePnLThreshold || user.settings.autoClosePnLThreshold;

    // Create the position record
    const position = await Position.create({
      userId: req.user!.id,
      token,
      longExchange,
      shortExchange,
      size,
      entryTimestamp: new Date(),
      entryFundingRates,
      autoCloseEnabled,
      autoCloseAPRThreshold: finalAPRThreshold,
      autoClosePnLThreshold: finalPnLThreshold,
      status: 'OPEN',
    });

    // TODO: Actually open positions on exchanges
    // For now, we'll simulate successful position opening
    position.longPositionId = `long_${position.id}_${Date.now()}`;
    position.shortPositionId = `short_${position.id}_${Date.now()}`;
    await position.save();

    res.status(201).json({
      id: position.id,
      token: position.token,
      longExchange: position.longExchange,
      shortExchange: position.shortExchange,
      size: position.size,
      entryTimestamp: position.entryTimestamp,
      entryFundingRates: position.entryFundingRates,
      currentPnl: position.currentPnl,
      status: position.status,
      autoCloseEnabled: position.autoCloseEnabled,
      autoCloseAPRThreshold: position.autoCloseAPRThreshold,
      autoClosePnLThreshold: position.autoClosePnLThreshold,
      createdAt: position.createdAt,
    });
  } catch (error) {
    console.error('Position creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPositions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      status: Joi.string().valid('OPEN', 'CLOSED', 'ERROR', 'CLOSING').optional(),
      token: Joi.string().valid('BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP').optional(),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: 'Query validation error',
        details: error.details,
      });
      return;
    }

    const { status, token, page, limit } = value;
    const offset = (page - 1) * limit;

    const whereClause: any = { userId: req.user!.id };
    if (status) whereClause.status = status;
    if (token) whereClause.token = token;

    const { count, rows: positions } = await Position.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      positions,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error('Positions fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    const hoursOpen = position.getHoursOpen();
    const shouldAutoClose = position.shouldAutoClose();

    res.json({
      ...position.toJSON(),
      hoursOpen,
      shouldAutoClose,
    });
  } catch (error) {
    console.error('Position fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const updateSchema = Joi.object({
      autoCloseEnabled: Joi.boolean().optional(),
      autoCloseAPRThreshold: Joi.number().min(0).max(100).optional(),
      autoClosePnLThreshold: Joi.number().min(-100).max(0).optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation error',
        details: error.details,
      });
      return;
    }

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    if (position.status !== 'OPEN') {
      res.status(400).json({ error: 'Cannot update closed or error positions' });
      return;
    }

    await position.update(value);

    res.json({
      message: 'Position updated successfully',
      position: position.toJSON(),
    });
  } catch (error) {
    console.error('Position update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const closePosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    if (position.status !== 'OPEN') {
      res.status(400).json({ error: 'Position is not open' });
      return;
    }

    // Set status to CLOSING to prevent other operations
    position.status = 'CLOSING';
    await position.save();

    try {
      // TODO: Actually close positions on exchanges
      // For now, we'll simulate successful closure
      
      position.status = 'CLOSED';
      position.closedAt = new Date();
      position.closedReason = 'Manual closure by user';
      await position.save();

      res.json({
        message: 'Position closed successfully',
        position: position.toJSON(),
      });
    } catch (closeError) {
      // Revert status if closing failed
      position.status = 'ERROR';
      position.closedReason = `Closure failed: ${closeError}`;
      await position.save();
      
      throw closeError;
    }
  } catch (error) {
    console.error('Position closure error:', error);
    res.status(500).json({ error: 'Failed to close position' });
  }
};

export const getPositionPnL = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    const hoursOpen = position.getHoursOpen();
    
    // TODO: Calculate real-time PnL from exchanges
    // For now, return stored PnL
    
    res.json({
      positionId: position.id,
      currentPnL: position.currentPnl,
      unrealizedPnL: position.currentPnl, // Simplified for now
      realizedPnL: 0, // Will be calculated from closed trades
      hoursOpen,
      lastUpdated: position.updatedAt,
      status: position.status,
    });
  } catch (error) {
    console.error('PnL calculation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};