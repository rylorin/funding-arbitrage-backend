const axios = require('axios');

class TestHyperliquidExchange {
  constructor() {
    this.baseUrl = 'https://api.hyperliquid.xyz';
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
      
      console.log('📊 Fetching predicted fundings from Hyperliquid...');
      
      // Get predicted funding rates
      const predictedResponse = await this.client.post('/info', {
        type: 'predictedFundings'
      });
      
      console.log(`Found predicted fundings for ${predictedResponse.data.length} tokens\n`);
      
      for (const token of tokens) {
        try {
          // Find predicted funding for this token
          const predictedFunding = predictedResponse.data.find(funding => funding.coin === token);
          
          if (predictedFunding) {
            const nextFunding = new Date(predictedFunding.nextFundingTime);
            
            const fundingRate = {
              exchange: 'hyperliquid',
              token,
              fundingRate: parseFloat(predictedFunding.fundingRate),
              fundingRatePercent: (parseFloat(predictedFunding.fundingRate) * 100).toFixed(6),
              nextFunding,
              timestamp: new Date()
            };
            
            fundingRates.push(fundingRate);
            
            console.log(`✅ ${token}:`);
            console.log(`   Predicted Funding Rate: ${fundingRate.fundingRatePercent}% per 8 hours`);
            console.log(`   Next Funding: ${nextFunding.toISOString()}`);
            console.log('');
          } else {
            // Try to get historical funding if no predicted funding available
            console.log(`📈 Getting historical funding for ${token}...`);
            
            const historyResponse = await this.client.post('/info', {
              type: 'fundingHistory',
              coin: token,
              startTime: Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
            });
            
            if (historyResponse.data && historyResponse.data.length > 0) {
              const latestFunding = historyResponse.data[historyResponse.data.length - 1];
              
              // Calculate next funding time (8-hour cycles)
              const lastFundingTime = new Date(latestFunding.time);
              const nextFunding = new Date(lastFundingTime.getTime() + (8 * 60 * 60 * 1000));
              
              const fundingRate = {
                exchange: 'hyperliquid',
                token,
                fundingRate: parseFloat(latestFunding.fundingRate),
                fundingRatePercent: (parseFloat(latestFunding.fundingRate) * 100).toFixed(6),
                nextFunding,
                timestamp: new Date(),
                premium: parseFloat(latestFunding.premium)
              };
              
              fundingRates.push(fundingRate);
              
              console.log(`✅ ${token} (Historical):`);
              console.log(`   Latest Funding Rate: ${fundingRate.fundingRatePercent}% per 8 hours`);
              console.log(`   Premium: ${(fundingRate.premium * 100).toFixed(6)}%`);
              console.log(`   Last Funding Time: ${lastFundingTime.toISOString()}`);
              console.log(`   Next Funding (estimated): ${nextFunding.toISOString()}`);
              console.log('');
            } else {
              console.log(`⚠️ No funding data available for ${token}`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing ${token}:`, error.message);
        }
      }
      
      return fundingRates;
    } catch (error) {
      console.error('❌ Error fetching funding rates:', error.message);
      throw error;
    }
  }

  async testAllMids() {
    try {
      console.log('🧪 Testing Hyperliquid allMids endpoint...');
      const response = await this.client.post('/info', {
        type: 'allMids'
      });
      
      console.log(`✅ Found mid prices for ${Object.keys(response.data).length} markets`);
      
      // Show a few examples
      const markets = Object.keys(response.data).slice(0, 5);
      console.log('Sample markets:');
      markets.forEach(market => {
        console.log(`  ${market}: $${response.data[market]}`);
      });
      console.log('');
      
      return response.data;
    } catch (error) {
      console.error('❌ Error testing allMids:', error.message);
      throw error;
    }
  }
}

async function testHyperliquidConnector() {
  console.log('🧪 Testing Hyperliquid Exchange Connector\n');
  
  const hyperliquid = new TestHyperliquidExchange();
  const tokens = ['BTC', 'ETH', 'SOL'];
  
  try {
    // First test basic connectivity
    await hyperliquid.testAllMids();
    
    // Then test funding rates
    const rates = await hyperliquid.getFundingRates(tokens);
    
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

testHyperliquidConnector();