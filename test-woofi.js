const axios = require('axios');

class TestWoofiExchange {
  constructor() {
    this.baseUrl = 'https://testnet-api.orderly.org';
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
      
      console.log('📊 Fetching funding rates from Woofi (Orderly Network)...');
      
      // Get all predicted funding rates
      const response = await this.client.get('/v1/public/funding_rates');
      
      console.log(`Found funding rates for ${response.data.data?.rows?.length || 0} markets\n`);
      
      if (!response.data.data?.rows || response.data.data.rows.length === 0) {
        console.log('⚠️ No funding rates available from API');
        return fundingRates;
      }

      // Show sample of available markets
      console.log('📋 Available markets sample:');
      response.data.data.rows.slice(0, 10).forEach(funding => {
        console.log(`  ${funding.symbol}: ${(parseFloat(funding.est_funding_rate) * 100).toFixed(6)}%/8hr`);
      });
      console.log('');
      
      for (const token of tokens) {
        try {
          // Woofi/Orderly uses format like PERP_BTC_USDC
          const symbol = `PERP_${token}_USDC`;
          
          // Find funding rate for this token
          const tokenFunding = response.data.data.rows.find(funding => funding.symbol === symbol);
          
          if (tokenFunding) {
            const fundingRate = parseFloat(tokenFunding.est_funding_rate);
            const nextFunding = new Date(tokenFunding.next_funding_time);
            const lastFunding = new Date(tokenFunding.last_funding_rate_timestamp);
            
            const fundingRateData = {
              exchange: 'woofi',
              token,
              symbol,
              fundingRate,
              fundingRatePercent: (fundingRate * 100).toFixed(6),
              nextFunding,
              lastFunding,
              lastFundingRate: parseFloat(tokenFunding.last_funding_rate),
              timestamp: new Date()
            };
            
            fundingRates.push(fundingRateData);
            
            console.log(`✅ ${token} (${symbol}):`);
            console.log(`   Est. Funding Rate: ${fundingRateData.fundingRatePercent}% per 8 hours`);
            console.log(`   Last Funding Rate: ${(fundingRateData.lastFundingRate * 100).toFixed(6)}%`);
            console.log(`   Last Funding: ${lastFunding.toISOString()}`);
            console.log(`   Next Funding: ${nextFunding.toISOString()}`);
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

  async testExchangeInfo() {
    try {
      console.log('🧪 Testing Woofi exchange info endpoint...');
      const response = await this.client.get('/v1/public/info');
      
      console.log(`✅ Found ${response.data.data?.rows?.length || 0} markets`);
      
      // Show BTC, ETH, SOL markets
      const relevantMarkets = response.data.data?.rows?.filter(market => 
        ['PERP_BTC_USDC', 'PERP_ETH_USDC', 'PERP_SOL_USDC'].includes(market.symbol)
      ) || [];
      
      if (relevantMarkets.length > 0) {
        console.log('Relevant markets:');
        relevantMarkets.forEach(market => {
          console.log(`  ${market.symbol}: funding_period=${market.funding_period}h, cap=${market.cap_funding}, floor=${market.floor_funding}`);
        });
      }
      console.log('');
      
      return response.data;
    } catch (error) {
      console.error('❌ Error testing exchange info:', error.message);
      throw error;
    }
  }
}

async function testWoofiConnector() {
  console.log('🧪 Testing Woofi (Orderly Network) Exchange Connector\n');
  
  const woofi = new TestWoofiExchange();
  const tokens = ['BTC', 'ETH', 'SOL'];
  
  try {
    // First test basic connectivity
    await woofi.testExchangeInfo();
    
    // Then test funding rates
    const rates = await woofi.getFundingRates(tokens);
    
    console.log('📋 Summary:');
    console.log('═'.repeat(60));
    rates.forEach(rate => {
      // Convert 8-hour rate to annualized APR
      // 8-hour rate * 3 cycles per day * 365 days
      const annualAPR = (rate.fundingRate * 3 * 365 * 100).toFixed(2);
      console.log(`${rate.token}: ${rate.fundingRatePercent}%/8hr (${annualAPR}% APR)`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testWoofiConnector();