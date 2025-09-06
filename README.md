# Funding Arbitrage Backend API

> **Complete Node.js backend for crypto funding rate arbitrage platform**  
> Supporting 7+ exchanges with real-time WebSocket updates and automated position management

[![Node.js](https://img.shields.io/badge/node.js-20.19.2+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.1.6-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start development server
npm run dev
```

Server runs on `http://localhost:3000` with WebSocket support at `/socket.io`

## 📋 Table of Contents

- [Features Overview](#-features-overview)
- [API Reference](#-api-reference)
- [WebSocket Integration](#-websocket-integration)
- [Data Models](#-data-models)
- [Authentication](#-authentication)
- [Exchange Support](#-exchange-support)
- [Frontend Integration Guide](#-frontend-integration-guide)
- [Environment Setup](#-environment-setup)
- [Architecture](#-architecture)

## ✨ Features Overview

### 🎯 **Implemented Priorities**

| Priority | Status | Description |
|----------|--------|-------------|
| **P1** | ✅ | **Dashboard API** - Dashboard interface with funding rates and opportunities |
| **P2** | ✅ | **Position Monitoring** - Real-time position tracking, alerts, and performance analytics |
| **P3** | ✅ | **Auto-Close System** - Automated position closure based on APR, PnL, and time thresholds |
| **P4** | ✅ | **Auto-Trading** - Automated position opening for best opportunities |

### 🔧 **Core Capabilities**

- **Multi-Exchange Arbitrage** - Detect funding rate spreads across 7+ exchanges
- **Real-Time Data** - WebSocket streaming for funding rates and position updates
- **Risk Management** - Configurable thresholds and automated safeguards  
- **Web3 Authentication** - Secure wallet-based login with message signing
- **Background Jobs** - Automated monitoring and execution systems

---

## 🔌 API Reference

### Base URL
```
Production:  https://your-domain.com/api
Development: http://localhost:3000/api
```

### 📊 Dashboard Endpoints

#### `GET /dashboard/`
**Main Dashboard - modern and aestetic style interface**

```typescript
// Response Type
interface DashboardResponse {
  success: boolean;
  data: {
    fundingRates: Record<string, FundingRateDisplay[]>;
    allRates: FundingRateDisplay[];
    opportunities: ArbitrageOpportunityDisplay[];
    stats: {
      totalExchanges: number;
      activeMarkets: number;
      totalOpportunities: number;
      bestAPR: number;
      avgFundingRate: number;
      lastUpdated: string;
    };
  };
  timestamp: string;
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "rank": 1,
        "token": "BTC",
        "longExchange": "VEST",
        "shortExchange": "HYPERLIQUID", 
        "spreadAPR": "23.45%",
        "confidence": 85,
        "riskLevel": "LOW",
        "expectedDailyReturn": "$12.34",
        "maxSize": "$10,000"
      }
    ],
    "stats": {
      "totalOpportunities": 15,
      "bestAPR": 23.45,
      "avgFundingRate": 0.0123
    }
  }
}
```

#### `GET /dashboard/funding-rates`
**Sortable funding rates table**

**Query Parameters:**
```typescript
interface FundingRatesQuery {
  token?: 'BTC' | 'ETH' | 'SOL' | 'AVAX' | 'MATIC' | 'ARB' | 'OP';
  exchange?: 'vest' | 'hyperliquid' | 'orderly' | 'extended';
  sortBy?: 'fundingRate' | 'apr' | 'exchange' | 'nextFunding';
  sortOrder?: 'asc' | 'desc';
}
```

#### `GET /dashboard/opportunities`
**Detailed arbitrage opportunities**

**Query Parameters:**
```typescript
interface OpportunitiesQuery {
  minAPR?: number;        // Default: 5
  maxSize?: number;       // Default: 10000
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  token?: TokenSymbol;
  limit?: number;         // Default: 20
}
```

#### `GET /dashboard/overview`
**Market overview and statistics**

---

### 📈 Position Endpoints

#### `GET /positions/dashboard`
**Comprehensive position dashboard**

```typescript
interface PositionDashboardResponse {
  success: boolean;
  data: {
    summary: PortfolioStats;
    activePositions: EnrichedPosition[];
    positionHistory: HistoryData;
    alerts: PositionAlert[];
    recommendations: Recommendation[];
  };
}

interface EnrichedPosition {
  id: string;
  token: TokenSymbol;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  size: number;
  sizeFormatted: string;
  currentPnL: number;
  currentPnLFormatted: string;
  pnlPercentage: number;
  currentAPR: number;
  aprChange: number;
  hoursOpen: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  shouldClose: boolean;
  exchangeColors: {
    long: string;
    short: string;
  };
}
```

#### `GET /positions/alerts`
**Position alerts and warnings**

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "pnl_critical_123",
        "positionId": "123",
        "type": "CRITICAL_LOSS",
        "severity": "CRITICAL",
        "message": "Position BTC has critical loss: -$234.56",
        "recommendedAction": "CLOSE_IMMEDIATELY"
      }
    ],
    "summary": {
      "total": 5,
      "critical": 1,
      "high": 2,
      "medium": 1,
      "low": 1
    }
  }
}
```

#### `GET /positions/:id/details`
**Detailed position analysis**

#### `POST /positions/`
**Create new position**

```typescript
interface CreatePositionRequest {
  token: TokenSymbol;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  size: number;
  entryFundingRates: {
    longRate: number;
    shortRate: number;
    spreadAPR: number;
  };
  autoCloseEnabled?: boolean;
  autoCloseAPRThreshold?: number;
  autoClosePnLThreshold?: number;
}
```

---

### 🏦 Exchange Endpoints

#### `GET /exchanges/funding-rates`
**Latest funding rates from all exchanges**

#### `GET /exchanges/status`
**Exchange connection health**

---

### 🔐 Authentication Endpoints

#### `POST /auth/login`
**Web3 wallet authentication**

```typescript
interface LoginRequest {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: number;
}

interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    walletAddress: string;
    settings: UserSettings;
  };
}
```

---

## 🔌 WebSocket Integration

### Connection
```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Client → Server Events

```typescript
// Subscribe to position updates
socket.emit('subscribe-positions', { userId: 'user-id' });

// Subscribe to funding rate updates  
socket.emit('subscribe-funding-rates');

// Subscribe to arbitrage opportunities
socket.emit('subscribe-opportunities');
```

### Server → Client Events

```typescript
// Funding rate updates (every minute)
socket.on('funding-rates-update', (data: FundingRateUpdate) => {
  console.log('New funding rates:', data.rates);
});

// Position PnL updates (every 30 seconds)
socket.on('position-pnl-update', (data: PositionUpdate) => {
  console.log('Position update:', data);
});

// New arbitrage opportunities
socket.on('opportunity-alert', (data: OpportunityAlert) => {
  console.log('New opportunity:', data.opportunity);
});

// Automated position closures
socket.on('position-closed', (data: PositionClosure) => {
  console.log('Position auto-closed:', data);
});

// System alerts and notifications
socket.on('system-alert', (data: SystemAlert) => {
  console.log('System alert:', data);
});
```

### Real-Time Event Types

```typescript
interface FundingRateUpdate {
  type: 'funding-rates-update';
  timestamp: string;
  rates: FundingRateData[];
}

interface PositionUpdate {
  type: 'position-pnl-update'; 
  positionId: string;
  userId: string;
  currentPnL: number;
  currentAPR: number;
  riskLevel: RiskLevel;
  shouldClose: boolean;
}

interface OpportunityAlert {
  type: 'opportunity-alert';
  opportunity: ArbitrageOpportunity;
  reason: 'new' | 'apr_increase' | 'risk_decreased';
}
```

---

## 📝 Data Models

### Core Types

```typescript
// Enums
export type ExchangeName = 'vest' | 'hyperliquid' | 'orderly' | 'extended' | 'paradex' | 'backpack' | 'hibachi';
export type TokenSymbol = 'BTC' | 'ETH' | 'SOL' | 'AVAX' | 'MATIC' | 'ARB' | 'OP';
export type PositionStatus = 'OPEN' | 'CLOSED' | 'ERROR' | 'CLOSING';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Funding Rate Data
export interface FundingRateData {
  exchange: ExchangeName;
  token: TokenSymbol;
  fundingRate: number;
  nextFunding: Date;
  timestamp: Date;
  markPrice?: number;
  indexPrice?: number;
  openInterest?: number;
  volume24h?: number;
}

// Arbitrage Opportunity
export interface ArbitrageOpportunity {
  token: TokenSymbol;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  longFundingRate: number;
  shortFundingRate: number;
  spreadAPR: number;
  confidence: number;
  minSize: number;
  maxSize: number;
  riskLevel: RiskLevel;
  longMarkPrice: number;
  shortMarkPrice: number;
  priceDeviation: number;
  fundingFrequency: {
    longExchange: string;
    shortExchange: string;
  };
  nextFundingTimes: {
    longExchange: Date;
    shortExchange: Date;
  };
}

// Position Model
export interface Position {
  id: string;
  userId: string;
  token: TokenSymbol;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  longToken?: TokenSymbol;
  shortToken?: TokenSymbol;
  longPositionId?: string;
  shortPositionId?: string;
  size: number;
  entrySpreadAPR?: number;
  longFundingRate?: number;
  shortFundingRate?: number;
  longMarkPrice?: number;
  shortMarkPrice?: number;
  currentPnL?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  totalFees?: number;
  hoursOpen?: number;
  status: PositionStatus;
  autoCloseEnabled: boolean;
  autoCloseAPRThreshold?: number;
  autoClosePnLThreshold?: number;
  autoCloseTimeoutHours?: number;
  closeReason?: string;
  createdAt: Date;
  closedAt?: Date;
  lastUpdated?: Date;
}

// User Settings
export interface UserSettings {
  autoTradingEnabled: boolean;
  maxPositionSize: number;
  maxSimultaneousPositions: number;
  riskTolerance: 'low' | 'medium' | 'high';
  allowedExchanges: ExchangeName[];
  autoCloseEnabled: boolean;
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
}
```

### Database Schema Relationships

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(42) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Positions Table  
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token VARCHAR(10) NOT NULL,
  long_exchange VARCHAR(20) NOT NULL,
  short_exchange VARCHAR(20) NOT NULL,
  size DECIMAL(20,8) NOT NULL,
  entry_spread_apr DECIMAL(8,4),
  current_pnl DECIMAL(20,8) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'OPEN',
  auto_close_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Funding Rates Table
CREATE TABLE funding_rates (
  exchange VARCHAR(20) NOT NULL,
  token VARCHAR(10) NOT NULL,
  funding_rate DECIMAL(12,8) NOT NULL,
  mark_price DECIMAL(20,8),
  next_funding TIMESTAMP NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (exchange, token, timestamp)
);
```

---

## 🔐 Authentication

### Web3 Wallet Authentication Flow

```typescript
// 1. Generate challenge message
const message = `Welcome to Funding Arbitrage Platform!

Please sign this message to authenticate:
Wallet: ${walletAddress}
Timestamp: ${Date.now()}
Nonce: ${randomNonce}`;

// 2. Sign message with wallet
const signature = await signer.signMessage(message);

// 3. Send to backend for verification
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress,
    signature,
    message,
    timestamp: Date.now()
  })
});

// 4. Store JWT token
const { token } = await response.json();
localStorage.setItem('authToken', token);
```

### Using JWT Token

```typescript
// Add to request headers
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
  'Content-Type': 'application/json'
};

// Automatic inclusion in WebSocket
const socket = io('http://localhost:3000', {
  auth: {
    token: localStorage.getItem('authToken')
  }
});
```

---

## 🏦 Exchange Support

### Active Integrations

| Exchange | Status | Funding Frequency | Supported Tokens |
|----------|--------|-------------------|------------------|
| **Vest** | ✅ Live | Hourly | BTC, ETH, SOL, ARB, OP |
| **Hyperliquid** | ✅ Live | 8 Hours | BTC, ETH, SOL, AVAX |
| **Orderly Network** | ✅ Live | 8 Hours | BTC, ETH, SOL, MATIC |
| **Extended** | ✅ Live | Hourly | 78+ tokens (crypto, TradFi, DeFi) |
| **Paradex** | 🔄 Planned | 8 Hours | TBD |
| **Backpack** | 🔄 Planned | 8 Hours | TBD |
| **Hibachi** | 🔄 Planned | 8 Hours | TBD |

### Exchange-Specific Details

#### Vest Exchange
```typescript
{
  fundingFrequency: 'hourly',
  apiEndpoint: '/ticker/latest',
  authRequired: true,
  rateLimit: '10 req/min',
  dataFields: ['oneHrFundingRate', 'markPrice', 'nextFundingRate']
}
```

#### Hyperliquid  
```typescript
{
  fundingFrequency: '8hour',
  apiEndpoint: '/info',
  authRequired: false,
  rateLimit: '30 req/min', 
  dataFields: ['predictedFundings', 'fundingHistory']
}
```

---

## 🌐 Frontend Integration Guide

### React Integration Example

```typescript
// hooks/useFundingRates.ts
import { useState, useEffect } from 'react';
import io from 'socket.io-client';

export function useFundingRates() {
  const [rates, setRates] = useState<FundingRateData[]>([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL, {
      auth: { token: localStorage.getItem('authToken') }
    });

    newSocket.on('funding-rates-update', (data) => {
      setRates(data.rates);
    });

    newSocket.emit('subscribe-funding-rates');
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  return { rates, socket };
}
```

### State Management (Redux Toolkit)

```typescript
// store/slices/dashboardSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchDashboard = createAsyncThunk(
  'dashboard/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/dashboard/');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    fundingRates: [],
    opportunities: [],
    stats: null,
    loading: false,
    error: null
  },
  reducers: {
    updateFundingRates: (state, action) => {
      state.fundingRates = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.fundingRates = action.payload.data.allRates;
        state.opportunities = action.payload.data.opportunities;
        state.stats = action.payload.data.stats;
      });
  }
});
```

### Error Handling

```typescript
// utils/errorHandler.ts
export function handleApiError(error: any) {
  if (error.response?.status === 401) {
    // Redirect to login
    window.location.href = '/login';
  } else if (error.response?.status === 429) {
    // Rate limit exceeded
    toast.error('Too many requests. Please try again later.');
  } else {
    // Generic error
    toast.error(error.response?.data?.message || 'Something went wrong');
  }
}

// API client with interceptors
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    handleApiError(error);
    return Promise.reject(error);
  }
);
```

### Performance Optimization

```typescript
// Rate limiting for WebSocket updates
let updateTimeout: NodeJS.Timeout;
socket.on('position-pnl-update', (data) => {
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    updatePositions(data);
  }, 100); // Debounce updates
});

// Memoized components for performance
const OpportunityCard = React.memo(({ opportunity }: { opportunity: ArbitrageOpportunity }) => {
  return (
    <div className="opportunity-card">
      <span className="token">{opportunity.token}</span>
      <span className="apr">{opportunity.spreadAPR.toFixed(2)}%</span>
    </div>
  );
});
```

---

## ⚙️ Environment Setup

### Required Environment Variables

```env
# === DATABASE ===
DATABASE_URL=postgresql://username:password@localhost:5432/funding_arbitrage
NODE_ENV=development

# === AUTHENTICATION ===
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=24h

# === WEB3 ===
ALCHEMY_API_KEY=your-alchemy-api-key
PRIVATE_KEY=your-wallet-private-key-for-signing

# === EXCHANGE APIS ===
# Vest Exchange
VEST_API_KEY=your-vest-api-key
VEST_SECRET_KEY=your-vest-secret-key

# Hyperliquid (public API - no keys needed)

# Orderly Network  
ORDERLY_API_KEY=your-orderly-key
ORDERLY_SECRET_KEY=your-orderly-secret

# Extended Exchange
EXTENDED_API_KEY=your-extended-key

# === SERVER CONFIG ===
PORT=3000
CORS_ORIGINS=http://localhost:3001,https://yourdomain.com

# === RATE LIMITING ===
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# === LOGGING ===
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

### Development Setup

```bash
# 1. Install Node.js 20.19.2+
nvm install 20.19.2
nvm use 20.19.2

# 2. Clone and install
git clone <repository>
cd funding-arbitrage-backend
npm install

# 3. Database setup (PostgreSQL)
createdb funding_arbitrage
npm run db:migrate

# 4. Start development
npm run dev

# 5. Run tests
npm run test

# 6. Type checking
npm run typecheck
```

### Production Deployment

```bash
# Build application
npm run build

# Start production server
npm start

# PM2 deployment (recommended)
pm2 start dist/index.js --name funding-arbitrage-backend
pm2 save
```

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Exchanges     │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (REST APIs)   │
│                 │    │                 │    │                 │
│ • Dashboard     │    │ • Express API   │    │ • Vest          │
│ • Positions     │    │ • WebSocket     │    │ • Hyperliquid   │
│ • Auth          │    │ • Background    │    │ • Orderly       │
│                 │    │   Jobs          │    │ • Extended      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   Database      │
                       │   (PostgreSQL)  │
                       │                 │
                       │ • Users         │
                       │ • Positions     │
                       │ • Funding Rates │
                       │ • Trade History │
                       └─────────────────┘
```

### Background Jobs Schedule

| Job | Frequency | Purpose | Service |
|-----|-----------|---------|---------|
| **Funding Rate Updater** | Every 1 min | Fetch latest rates from all exchanges | `FundingRateService` |
| **Position Monitor** | Every 30 sec | Calculate PnL and check auto-close conditions | `PositionMonitoringService` |  
| **Auto Trader** | Every 5 min | Execute automated position opening | `AutoTradingService` |
| **Health Check** | Every 10 min | Monitor system health and exchange status | `HealthService` |

### Data Flow

```
Exchange APIs ──► Funding Rate Service ──► Database ──► WebSocket ──► Frontend
     │                                         │
     └── Background Jobs ────────────────────────┘
         • Position Monitoring
         • Auto Trading  
         • Risk Management
```

### Security Architecture

```
Request ──► Rate Limiter ──► CORS ──► Helmet ──► JWT Auth ──► API Handler
   │                                                  │
   └── Validation (Joi) ◄────────────────────────────┘
```

---

## 🚧 Development Scripts

```json
{
  "dev": "ts-node-dev --project tsconfig.json src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "jest",
  "test:watch": "jest --watch", 
  "lint": "eslint src/**/*.ts",
  "lint:fix": "eslint src/**/*.ts --fix",
  "typecheck": "tsc --noEmit",
  "db:migrate": "npx sequelize-cli db:migrate",
  "db:seed": "npx sequelize-cli db:seed:all"
}
```

### Testing Commands

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm test -- --coverage

# Test specific file
npm test -- positions.test.ts
```

---

## 📞 Support & Resources

### Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 123.45,
  "version": "1.0.0",
  "environment": "development",
  "database": "connected",
  "jobs": {
    "fundingRateUpdater": "running",
    "positionMonitor": "running", 
    "autoTrader": "running"
  }
}
```

### Troubleshooting

**Common Issues:**

1. **WebSocket Connection Failed**
   ```typescript
   // Add error handling
   socket.on('connect_error', (error) => {
     console.log('Connection failed:', error);
   });
   ```

2. **Rate Limited (429)**
   ```typescript
   // Implement exponential backoff
   const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
   await delay(Math.pow(2, retryCount) * 1000);
   ```

3. **Authentication Errors**
   ```typescript
   // Check JWT token validity
   const isTokenValid = jwt.verify(token, process.env.JWT_SECRET);
   ```

### Performance Monitoring

Monitor these endpoints:
- `/health` - System status
- WebSocket connection count
- Database query performance
- Background job execution times
- API response times

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to build your frontend? This backend provides everything you need for a professional crypto funding arbitrage platform!** 🚀