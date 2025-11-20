require('dotenv').config();

module.exports = {
  // EZ HIÁNYZOTT EDDIG:
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN
  },

  // Hálózat
  network: {
    name: 'Base',
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 8453,
    symbol: 'ETH',
    explorer: 'https://basescan.org'
  },

  // Kereskedés
  routerAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
  feeWallet: process.env.FEE_WALLET,

  // Díjak
  fees: {
    tradingFeePercent: 1,
    withdrawalFee: '0.001'
  },
  
  // Limitek
  limits: {
    minTradeETH: 0.001,
    maxTradeETH: 1.0
  },

  // Branding
  branding: {
    website: 'https://snipex.io',
    twitter: '@SnipeXBot',
    support: '@SnipeXSupport',
    tagline: 'Snipe. Swap. Profit.'
  },

  // Biztonság
  encryptionKey: process.env.ENCRYPTION_KEY
};

