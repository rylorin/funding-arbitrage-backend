import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';

import { connectDatabase, closeDatabaseConnection } from './config/database';
import { validateEnvironmentVariables } from './config/web3';
import { createWebSocketBroadcaster } from './websocket/broadcaster';
// import { createWebSocketHandlers } from './websocket/handlers';
import { jobManager } from './jobs/index';

// Routes
import authRoutes from './routes/auth';
import positionRoutes from './routes/positions';
import exchangeRoutes from './routes/exchanges';
import dashboardRoutes from './routes/dashboard';

// Initialize environment variables
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const jobHealth = await jobManager.getHealthCheck();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected', // Simplified for now
      jobs: jobHealth,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Funding Arbitrage Backend',
    version: '1.0.0',
    description: 'Backend API for crypto funding rate arbitrage platform',
    endpoints: {
      auth: '/api/auth',
      positions: '/api/positions',
      exchanges: '/api/exchanges',
      dashboard: '/api/dashboard',
      health: '/health',
      websocket: '/socket.io',
    },
    documentation: 'https://github.com/your-repo/funding-arbitrage-backend',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.method} ${req.originalUrl} was not found`,
    availableRoutes: ['/api/auth', '/api/positions', '/api/exchanges', '/api/dashboard', '/health'],
  });
});

// Global error handler
app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', error);
  
  if (res.headersSent) {
    return next(error);
  }

  const status = error.statusCode || error.status || 500;
  const message = error.message || 'Internal server error';

  res.status(status).json({
    error: 'Server error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

async function startServer(): Promise<void> {
  try {
    console.log('🚀 Starting Funding Arbitrage Backend...');
    
    // Validate environment variables
    console.log('🔧 Validating environment variables...');
    validateEnvironmentVariables();
    
    // Connect to database
    console.log('📊 Connecting to database...');
    await connectDatabase();
    
    // Create HTTP server
    const httpServer = createServer(app);
    
    // Initialize WebSocket server
    console.log('🔌 Setting up WebSocket server...');
    const wsServer = createWebSocketBroadcaster(httpServer);
    // const wsHandlers = createWebSocketHandlers(wsServer);
    
    // Start background jobs
    console.log('⚙️ Starting background jobs...');
    jobManager.startAll();
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 WebSocket server ready`);
      console.log(`🎯 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API docs: http://localhost:${PORT}/`);
      
      // Run initial funding rate update
      setTimeout(() => {
        console.log('🔄 Running initial funding rate update...');
        jobManager.runJobOnce('fundingRateUpdater').catch(console.error);
      }, 5000);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop background jobs
        console.log('⏹️ Stopping background jobs...');
        jobManager.stopAll();
        
        // Close WebSocket server
        console.log('🔌 Closing WebSocket server...');
        wsServer.close();
        
        // Close HTTP server
        console.log('🌐 Closing HTTP server...');
        httpServer.close();
        
        // Close database connection
        console.log('📊 Closing database connection...');
        await closeDatabaseConnection();
        
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});