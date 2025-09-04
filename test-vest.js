const axios = require('axios');

async function testVestAPI() {
  const baseUrl = 'https://server-mmdev.vestdev.exchange/v2';
  
  console.log('🧪 Testing Vest Exchange API endpoints...\n');
  
  try {
    // Test 1: Exchange Info
    console.log('1. Testing /exchangeInfo...');
    const exchangeInfo = await axios.get(`${baseUrl}/exchangeInfo`);
    console.log(`✅ Exchange Info: ${exchangeInfo.data.symbols?.length || 0} symbols available\n`);
    
    // Test 2: Funding History with parameters
    console.log('2. Testing /funding/history with symbol...');
    try {
      const fundingHistory = await axios.get(`${baseUrl}/funding/history`, {
        params: {
          symbol: 'BTC-PERP',
          limit: 10
        }
      });
      console.log(`✅ Funding History: ${Array.isArray(fundingHistory.data) ? fundingHistory.data.length : 'Unknown'} entries`);
      
      if (Array.isArray(fundingHistory.data) && fundingHistory.data.length > 0) {
        console.log('Sample funding data:', fundingHistory.data[0]);
      }
    } catch (err) {
      console.log('⚠️ Funding history failed:', err.response?.status, err.response?.data);
    }
    console.log('');
    
    // Test 3: Latest Ticker
    console.log('3. Testing /ticker/latest...');
    const ticker = await axios.get(`${baseUrl}/ticker/latest`);
    console.log(`✅ Latest Ticker: ${Array.isArray(ticker.data) ? ticker.data.length : 1} ticker(s)`);
    
    if (ticker.data) {
      const sample = Array.isArray(ticker.data) ? ticker.data[0] : ticker.data;
      console.log('Sample ticker:', sample);
    }
    console.log('');
    
    // Test 4: Specific symbol ticker
    console.log('4. Testing /ticker/latest?symbol=BTC-PERP...');
    try {
      const btcTicker = await axios.get(`${baseUrl}/ticker/latest?symbol=BTC-PERP`);
      console.log('✅ BTC-PERP ticker:', btcTicker.data);
    } catch (err) {
      console.log('⚠️ BTC-PERP ticker failed:', err.response?.status, err.response?.statusText);
    }
    
  } catch (error) {
    console.error('❌ API Test failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
  }
}

testVestAPI();