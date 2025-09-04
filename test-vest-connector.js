// Simple test du connecteur Vest sans authentification

const axios = require('axios');

class TestVestExchange {
  constructor() {
    this.baseUrl = 'https://server-mmdev.vestdev.exchange/v2';
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
      
      console.log('📊 Fetching all tickers...');
      const response = await this.client.get('/ticker/latest');
      const tickerData = response.data.tickers;
      
      console.log(`Found ${tickerData.length} tickers\n`);
      
      for (const token of tokens) {
        const symbol = `${token}-PERP`;
        
        try {
          const tokenTicker = tickerData.find(ticker => ticker.symbol === symbol);
          
          if (tokenTicker) {
            const now = new Date();
            const nextFunding = new Date(now.getTime() + (60 - now.getMinutes()) * 60 * 1000);
            nextFunding.setSeconds(0);
            nextFunding.setMilliseconds(0);
            
            const fundingRate = {
              exchange: 'vest',
              token,
              symbol,
              fundingRate: parseFloat(tokenTicker.oneHrFundingRate),
              fundingRatePercent: (parseFloat(tokenTicker.oneHrFundingRate) * 100).toFixed(6),
              nextFunding,
              timestamp: new Date(),
              markPrice: tokenTicker.markPrice ? parseFloat(tokenTicker.markPrice) : undefined,
              indexPrice: tokenTicker.indexPrice ? parseFloat(tokenTicker.indexPrice) : undefined,
              status: tokenTicker.status
            };
            
            fundingRates.push(fundingRate);
            
            console.log(`✅ ${token}-PERP:`);
            console.log(`   Funding Rate: ${fundingRate.fundingRatePercent}% per hour`);
            console.log(`   Mark Price: $${fundingRate.markPrice}`);
            console.log(`   Index Price: $${fundingRate.indexPrice}`);
            console.log(`   Status: ${fundingRate.status}`);
            console.log('');
          } else {
            console.log(`⚠️ ${token}-PERP not found`);
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
}

async function testVestConnector() {
  console.log('🧪 Testing Vest Exchange Connector\n');
  
  const vest = new TestVestExchange();
  const tokens = ['BTC', 'ETH', 'SOL'];
  
  try {
    const rates = await vest.getFundingRates(tokens);
    
    console.log('📋 Summary:');
    console.log('═'.repeat(50));
    rates.forEach(rate => {
      const annualAPR = (rate.fundingRate * 8760 * 100).toFixed(2); // 8760 hours per year
      console.log(`${rate.symbol}: ${rate.fundingRatePercent}%/hr (${annualAPR}% APR)`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testVestConnector();