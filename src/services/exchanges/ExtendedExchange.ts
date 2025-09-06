import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { ExchangeConnector, FundingRateData, TokenSymbol } from '../../types/index';
import { exchangeConfigs, exchangeEndpoints } from '../../config/exchanges';

interface ExtendedMarketStats {
  dailyVolume: string;
  dailyVolumeBase: string;
  dailyPriceChange: string;
  dailyPriceChangePercentage: string;
  dailyLow: string;
  dailyHigh: string;
  lastPrice: string;
  askPrice: string;
  bidPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingRate: number;
  openInterest: string;
  openInterestBase: string;
}

interface ExtendedMarket {
  name: string;
  uiName: string;
  category: string;
  assetName: string;
  assetPrecision: number;
  collateralAssetName: string;
  collateralAssetPrecision: number;
  active: boolean;
  status: string;
  marketStats: ExtendedMarketStats;
}

interface ExtendedMarketsResponse {
  status: string;
  data: ExtendedMarket[];
}

export class ExtendedExchange implements ExchangeConnector {
  public name = 'extended' as const;
  public isConnected = false;
  
  private client: AxiosInstance;
  private config = exchangeConfigs.extended;
  private baseUrl = exchangeEndpoints.extended.baseUrl;
  private wsUrl = exchangeEndpoints.extended.websocket;
  private ws: WebSocket | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add API key if available
    if (this.config.apiKey) {
      this.client.defaults.headers['X-Api-Key'] = this.config.apiKey;
    }

    this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with public endpoint - get markets
      const response = await this.client.get('/api/v1/info/markets');
      const marketsResponse = response.data as ExtendedMarketsResponse;
      
      this.isConnected = true;
      console.log(`✅ Extended Exchange connected: ${marketsResponse.data?.length || 0} markets available`);
    } catch (error) {
      console.error('❌ Failed to connect to Extended Exchange:', error);
      this.isConnected = false;
    }
  }

  private extractTokensFromTickers(marketsResponse: ExtendedMarket[]): TokenSymbol[] {
    return marketsResponse.map(m => {
        // Extract token from market name like BTC-USD
        const parts = m.name.split('-');
        return parts.length === 2 ? parts[0] as TokenSymbol : null;
      }).filter((t): t is TokenSymbol => t !== null);
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];
      
      // Get all markets to find funding rates
      const response = await this.client.get('/api/v1/info/markets');
      const marketsResponse = response.data as ExtendedMarketsResponse;

            // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(marketsResponse.data);

      // For each requested token, find its funding rate
      
      for (const token of tokensToProcess) {
        try {
          // Extended uses format like BTC-USD, ETH-USD, SOL-USD
          const symbol = `${token}-USD`;
          
          // Find market for this token
          const market = marketsResponse.data.find(m => m.name === symbol);
          
          if (market && market.marketStats) {
            // Use funding rate from market stats
            const fundingRate = parseFloat(market.marketStats.fundingRate);
            
            // Next funding time is provided in milliseconds
            const nextFunding = new Date(market.marketStats.nextFundingRate);
            
            fundingRates.push({
              exchange: 'extended',
              token,
              fundingRate,
              nextFunding,
              timestamp: new Date(),
              markPrice: parseFloat(market.marketStats.markPrice),
              indexPrice: parseFloat(market.marketStats.indexPrice),
            });
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Extended:`, error);
        }
      }
      
      return fundingRates;
    } catch (error) {
      console.error('Error fetching Extended funding rates:', error);
      throw new Error('Failed to fetch funding rates from Extended');
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      // Extended requires Stark signature for private endpoints
      // For now, return empty object as we don't have user wallet integration
      console.warn('Extended account balance requires Stark signature authentication');
      return {};
    } catch (error) {
      console.error('Error fetching Extended account balance:', error);
      throw new Error('Failed to fetch account balance from Extended');
    }
  }

  public async openPosition(token: TokenSymbol, side: 'long' | 'short', _size: number): Promise<string> {
    try {
      // Note: Extended requires Stark signature for trading operations
      // For now, throw an error indicating authentication is needed
      throw new Error('Extended position opening requires Stark signature authentication');
    } catch (error) {
      console.error(`Error opening Extended ${side} position for ${token}:`, error);
      throw new Error(`Failed to open ${side} position on Extended`);
    }
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      // Note: Extended requires Stark signature for trading operations
      throw new Error('Extended position closing requires Stark signature authentication');
    } catch (error) {
      console.error(`Error closing Extended position ${positionId}:`, error);
      return false;
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Note: Extended requires authentication for position data
      throw new Error('Extended position PnL requires Stark signature authentication');
    } catch (error) {
      console.error(`Error fetching Extended position PnL for ${positionId}:`, error);
      throw new Error('Failed to fetch position PnL from Extended');
    }
  }

  public async getAllPositions(): Promise<any[]> {
    try {
      // Note: Extended requires authentication for positions
      console.warn('Extended positions require Stark signature authentication');
      return [];
    } catch (error) {
      console.error('Error fetching Extended positions:', error);
      throw new Error('Failed to fetch positions from Extended');
    }
  }

  public async getOrderHistory(_symbol?: string, _limit: number = 100): Promise<any[]> {
    try {
      // Note: Extended requires authentication for order history
      console.warn('Extended order history requires Stark signature authentication');
      return [];
    } catch (error) {
      console.error('Error fetching Extended order history:', error);
      throw new Error('Failed to fetch order history from Extended');
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log('✅ Extended WebSocket connected');
        
        // Subscribe to market data updates (funding rates, prices)
        const subscribeMessage = {
          method: 'SUBSCRIBE',
          params: ['btcusdt@ticker', 'ethusdt@ticker', 'solusdt@ticker'],
          id: 1,
        };
        
        this.ws?.send(JSON.stringify(subscribeMessage));
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (error) {
          console.error('Error parsing Extended WebSocket message:', error);
        }
      });
      
      this.ws.on('error', (error) => {
        console.error('Extended WebSocket error:', error);
      });
      
      this.ws.on('close', () => {
        console.log('Extended WebSocket disconnected');
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
      
    } catch (error) {
      console.error('Error connecting to Extended WebSocket:', error);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const extendedExchange = new ExtendedExchange();