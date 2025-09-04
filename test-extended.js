const axios = require('axios');

class TestExtendedExchange {
  constructor() {
    this.baseUrl = 'https://api.starknet.extended.exchange';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getFundingRates(tokens) {
    try {
      const fundingRates = [];
      
      console.log('📊 Fetching markets from Extended Exchange...');
      
      // Get all markets
      const response = await this.client.get('/api/v1/info/markets');
      
      console.log(`Found ${response.data.data?.length || 0} markets\n`);
      
      if (!response.data.data || response.data.data.length === 0) {
        console.log('⚠️ No markets available from API');
        return fundingRates;
      }

      // Show sample of available markets
      console.log('📋 Available markets sample:');
      response.data.data.slice(0, 10).forEach(market => {
        console.log(`  ${market.name}: ${(parseFloat(market.marketStats.fundingRate) * 100).toFixed(6)}%/hr`);
      });
      console.log('');
      
      for (const token of tokens) {
        try {
          // Extended uses format like BTC-USD, ETH-USD, SOL-USD
          const symbol = `${token}-USD`;
          
          // Find market for this token
          const market = response.data.data.find(m => m.name === symbol);
          
          if (market && market.marketStats) {
            const fundingRate = parseFloat(market.marketStats.fundingRate);
            const nextFunding = new Date(market.marketStats.nextFundingRate);
            
            const fundingRateData = {
              exchange: 'extended',
              token,
              symbol,
              fundingRate,
              fundingRatePercent: (fundingRate * 100).toFixed(6),
              nextFunding,
              timestamp: new Date(),
              markPrice: parseFloat(market.marketStats.markPrice),
              indexPrice: parseFloat(market.marketStats.indexPrice),
              status: market.status,
              category: market.category
            };
            
            fundingRates.push(fundingRateData);
            
            console.log(`✅ ${token} (${symbol}):`);
            console.log(`   Funding Rate: ${fundingRateData.fundingRatePercent}% per hour`);
            console.log(`   Mark Price: $${fundingRateData.markPrice}`);
            console.log(`   Index Price: $${fundingRateData.indexPrice}`);
            console.log(`   Next Funding: ${nextFunding.toISOString()}`);
            console.log(`   Status: ${fundingRateData.status}`);
            console.log(`   Category: ${fundingRateData.category}`);
            console.log('');
          } else {
            console.log(`⚠️ ${token} (${symbol}) not found`);
          }
        } catch (error) {
          console.error(`❌ Error processing ${token}:`, error.message);
        }
      }
      
      return fundingRates;
    } catch (error) {
      console.error('❌ Error fetching funding rates:', error.message);
      console.error('Response status:', error.response?.status);
      console.error('Response data:', error.response?.data);
      throw error;
    }
  }

  async testMarketsEndpoint() {
    try {
      console.log('🧪 Testing Extended markets endpoint...');
      const response = await this.client.get('/api/v1/info/markets');
      
      console.log(`✅ Found ${response.data.data?.length || 0} markets`);
      console.log(`API Status: ${response.data.status}`);
      
      // Show crypto markets
      const cryptoMarkets = response.data.data?.filter(market => 
        ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD'].includes(market.name) && 
        market.status === 'ACTIVE'
      ) || [];
      
      if (cryptoMarkets.length > 0) {
        console.log('Crypto markets:');
        cryptoMarkets.forEach(market => {
          console.log(`  ${market.name}: ${market.status}, funding=${market.marketStats.fundingRate}`);
        });
      }
      console.log('');
      
      return response.data;
    } catch (error) {
      console.error('❌ Error testing markets endpoint:', error.message);
      throw error;
    }
  }
}

async function testExtendedConnector() {
  console.log('🧪 Testing Extended Exchange Connector\n');
  
  const extended = new TestExtendedExchange();
  const tokens = ['BTC', 'ETH', 'SOL'];
  
  try {
    // First test basic connectivity
    await extended.testMarketsEndpoint();
    
    // Then test funding rates
    const rates = await extended.getFundingRates(tokens);
    
    console.log('📋 Summary:');
    console.log('═'.repeat(60));
    rates.forEach(rate => {
      // Extended funding is hourly, so convert to annualized APR
      // Hourly rate * 24 hours * 365 days
      const annualAPR = (rate.fundingRate * 24 * 365 * 100).toFixed(2);
      console.log(`${rate.token}: ${rate.fundingRatePercent}%/hr (${annualAPR}% APR)`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testExtendedConnector();