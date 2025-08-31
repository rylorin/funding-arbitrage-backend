# Funding Arbitrage Backend

A Node.js backend for a crypto funding rate arbitrage platform supporting 7+ exchanges with real-time WebSocket updates and automated position management.

## Features

- **Web3 Authentication**: Wallet-based authentication using ethers.js
- **Multi-Exchange Support**: Vest, Hyperliquid, Orderly, Extended/Woofi, Paradex, Backpack, Hibachi
- **Real-time Data**: WebSocket server for live funding rates and position updates
- **Automated Trading**: Background jobs for position monitoring and auto-closure
- **Risk Management**: Configurable thresholds and automated risk controls
- **RESTful API**: Complete CRUD operations for positions and user management

## Tech Stack

- **Runtime**: Node.js 20.19.2 + TypeScript
- **Framework**: Express.js + Socket.io
- **Database**: Sequelize ORM + PostgreSQL (prod) / SQLite (dev)
- **Web3**: Ethers.js v6 for wallet authentication
- **Jobs**: node-cron for automated tasks
- **Validation**: Joi for request validation
- **Testing**: Jest + Supertest

## Quick Start

### Prerequisites

- Node.js 20.19.2+
- PostgreSQL (for production) or SQLite (for development)
- Alchemy API key (for Web3 functionality)
- Exchange API keys (Vest, Hyperliquid, etc.)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd funding-arbitrage-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000` with:
- API endpoints at `/api/*`
- WebSocket server at `/socket.io`
- Health check at `/health`

## Environment Configuration

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/funding_arbitrage
NODE_ENV=development

# Authentication
JWT_SECRET=your-jwt-secret

# Web3
ALCHEMY_API_KEY=your-alchemy-key

# Exchange APIs
VEST_API_KEY=your-vest-api-key
VEST_SECRET_KEY=your-vest-secret-key
# ... other exchange keys

# Server
PORT=3000
CORS_ORIGINS=http://localhost:3001
```

## API Documentation

### Authentication

```http
POST /api/auth/challenge
POST /api/auth/verify
GET /api/auth/profile
PUT /api/auth/settings
```

### Positions

```http
GET /api/positions
POST /api/positions
GET /api/positions/:id
PUT /api/positions/:id
DELETE /api/positions/:id
GET /api/positions/:id/pnl
```

### Exchanges

```http
GET /api/exchanges/funding-rates
GET /api/exchanges/opportunities
GET /api/exchanges/status
GET /api/exchanges/:exchange/pairs
```

### Dashboard

```http
GET /api/dashboard/stats
GET /api/dashboard/performance
GET /api/dashboard/opportunities
```

## WebSocket Events

### Client → Server
- `subscribe-positions`: Subscribe to position updates
- `subscribe-opportunities`: Subscribe to arbitrage alerts
- `ping`: Heartbeat check

### Server → Client
- `funding-rates-update`: New funding rate data
- `position-pnl-update`: Position PnL changes
- `opportunity-alert`: New arbitrage opportunities
- `position-closed`: Automated position closure
- `system-alert`: System notifications

## Database Schema

### Users
- `id`: UUID primary key
- `walletAddress`: Ethereum address
- `settings`: JSON configuration

### Positions
- `id`: UUID primary key
- `userId`: Foreign key to users
- `token`: Trading pair (BTC, ETH, SOL, etc.)
- `longExchange`/`shortExchange`: Exchange names
- `size`: Position size
- `entryFundingRates`: Entry conditions
- `currentPnl`: Current profit/loss
- `autoCloseEnabled`: Auto-closure setting
- `status`: OPEN/CLOSED/ERROR/CLOSING

### FundingRates
- `exchange`: Exchange name
- `token`: Token symbol
- `fundingRate`: Current rate
- `timestamp`: Data timestamp
- `nextFunding`: Next funding time

### TradeHistory
- `positionId`: Associated position
- `exchange`: Exchange name
- `side`: long/short/close_long/close_short
- `size`: Trade size
- `price`: Execution price
- `fee`: Trading fees

## Background Jobs

### Funding Rate Updater
- **Frequency**: Every minute
- **Purpose**: Fetch latest funding rates from all exchanges
- **Features**: Auto-retry, error handling, WebSocket broadcasting

### Position Monitor
- **Frequency**: Every 30 seconds
- **Purpose**: Calculate real-time PnL and check auto-close conditions
- **Features**: Risk management, threshold monitoring

### Auto Closer
- **Frequency**: Every minute
- **Purpose**: Execute automatic position closures
- **Conditions**: APR below threshold, PnL limits, timeout

## Exchange Integration

### Vest Exchange (Implemented)
- REST API with HMAC signature authentication
- WebSocket for real-time data
- Support for BTC, ETH, SOL, ARB, OP perpetuals

### Planned Integrations
- Hyperliquid: Public + private API
- Orderly: EVM-compatible API
- Extended/Woofi: CCXT compatible
- Paradex, Backpack, Hibachi: Phase 2

## Development Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript to JavaScript
npm run start        # Start production server
npm run test         # Run test suite
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
```

## Project Structure

```
src/
├── config/          # Database, Web3, exchange configurations
├── models/          # Sequelize database models
├── controllers/     # API request handlers
├── services/        # Business logic services
│   ├── exchanges/   # Exchange connectors
│   ├── web3/        # Authentication services
│   └── arbitrage/   # Trading logic (future)
├── routes/          # Express route definitions
├── middleware/      # Authentication, validation, rate limiting
├── websocket/       # WebSocket server and handlers
├── jobs/            # Background job definitions
├── utils/           # Utility functions and constants
└── types/           # TypeScript type definitions
```

## Security Features

- **Web3 Authentication**: Message signing verification
- **Rate Limiting**: Per-user and per-endpoint limits
- **Input Validation**: Joi schema validation
- **CORS Protection**: Configurable origin restrictions
- **Helmet Security**: Standard security headers
- **Environment Isolation**: Separate configs for dev/prod

## Monitoring & Logging

- **Health Checks**: `/health` endpoint with job status
- **Structured Logging**: Winston with different log levels
- **Error Tracking**: Global error handlers
- **Performance Metrics**: Request timing and job execution stats

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker (Future)
```bash
docker build -t funding-arbitrage-backend .
docker run -p 3000:3000 --env-file .env funding-arbitrage-backend
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Run linting: `npm run lint`
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For questions or support:
- Create an issue on GitHub
- Check the API documentation at `/`
- Monitor health status at `/health`