import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => ({
          message: detail.message,
          path: detail.path,
        })),
      });
      return;
    }
    
    req.body = value;
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query);
    
    if (error) {
      res.status(400).json({
        error: 'Query validation error',
        details: error.details.map(detail => ({
          message: detail.message,
          path: detail.path,
        })),
      });
      return;
    }
    
    req.query = value;
    next();
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params);
    
    if (error) {
      res.status(400).json({
        error: 'Parameter validation error',
        details: error.details.map(detail => ({
          message: detail.message,
          path: detail.path,
        })),
      });
      return;
    }
    
    req.params = value;
    next();
  };
};

// Common validation schemas
export const schemas = {
  walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
  uuid: Joi.string().uuid().required(),
  token: Joi.string().valid('BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP').required(),
  exchange: Joi.string().valid('vest', 'hyperliquid', 'orderly', 'extended', 'paradex', 'backpack', 'hibachi').required(),
  positiveNumber: Joi.number().positive().required(),
  nonNegativeNumber: Joi.number().min(0).required(),
  percentage: Joi.number().min(-100).max(100).required(),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  },
};