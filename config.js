require('dotenv').config();

module.exports = {
  // Telegram
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  
  // Hálózat beállítások (BASE MAINNET)
  network: {
    name: 'Base',
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 8453,
    symbol: 'ETH', // Base-en is ETH a fizetőeszköz, de Base ETH!
    explorer: 'https://basescan.org'
  },

  // Uniswap V2 Router (Base-en a Uniswap V2 vagy SushiSwap címe kell)
  // Base Swap Router vagy Uniswap Universal Router
  routerAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', // Uniswap Universal Router Base-en

  // Díjak
  feeWallet: process.env.FEE_WALLET,
  feePercent: 0.01, // 1% jutalék
  minDeposit: 0.001, // Kisebb minimum befizetés (kb. 2-3 dollár)

  // Biztonság
  encryptionKey: process.env.ENCRYPTION_KEY
};