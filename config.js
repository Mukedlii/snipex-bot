require('dotenv').config();

module.exports = {
  // Telegram
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  
  // Hálózat beállítások (BASE)
  network: {
    name: 'Base',
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 8453,
    symbol: 'ETH',
    explorer: 'https://basescan.org'
  },

  // Router cím (Base Uniswap/Swap)
  routerAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',

  // Díjak
  feeWallet: process.env.FEE_WALLET,
  feePercent: 0.01,
  minDeposit: 0.001,

  // Biztonság
  encryptionKey: process.env.ENCRYPTION_KEY
};
