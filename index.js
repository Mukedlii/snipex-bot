const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers'); // JAVÍTVA: Hiányzott ez a sor!
const config = require('./config');
const database = require('./database');
const walletManager = require('./wallet');
const tradingEngine = require('./trading');

// JAVÍTVA: Most már megtalálja a config.telegram.token-t
const bot = new TelegramBot(config.telegram.token, { polling: true });

const welcomeArt = `
╔═══════════════════════════╗
║      ⚡ SNIPEX BOT ⚡      ║
║   Snipe. Swap. Profit.    ║
╚═══════════════════════════╝
`;

// Start
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  let user = await database.getUser(userId);
  
  if (!user) {
    const newWallet = walletManager.createWallet();
    await database.saveUser(userId, newWallet.privateKey, newWallet.address);
    
    bot.sendMessage(userId, `
${welcomeArt}

🎯 *Welcome to SnipeX!*
Your wallet: \`${newWallet.address}\`

💰 *Fees:*
• Trading: ${config.fees.tradingFeePercent}% per swap
• Withdrawal: ${config.fees.withdrawalFee} ETH

🚀 /deposit - Start here!
    `, { parse_mode: 'Markdown' });
  } else {
    const balance = await walletManager.getBalance(user.address);
    bot.sendMessage(userId, `
${welcomeArt}
Welcome back! 👋
💼 Wallet: \`${user.address}\`
💰 Balance: ${parseFloat(balance).toFixed(4)} ETH
    `, { parse_mode: 'Markdown' });
  }
});

// Deposit
bot.onText(/\/deposit/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  bot.sendMessage(userId, `
💰 *Deposit ETH (Base)*
Send ETH to: \`${user.address}\`
Min: ${config.limits.minTradeETH} ETH
  `, { parse_mode: 'Markdown' });
});

// Balance
bot.onText(/\/balance/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  try {
    const balance = await walletManager.getBalance(user.address);
    bot.sendMessage(userId, `
📊 *Balance:* ${parseFloat(balance).toFixed(6)} ETH
📍 \`${user.address}\`
    `, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(userId, '❌ Error fetching balance');
  }
});

// Buy
bot.onText(/\/buy(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `🎯 Usage: \`/buy <token> <amount>\``, { parse_mode: 'Markdown' });
  }
  
  const tokenAddress = match[1].trim();
  const ethAmount = match[2].trim();
  
  // JAVÍTVA: ethers.utils.isAddress (a régi kód 'ethAddress'-t keresett)
  if (!ethers.utils.isAddress(tokenAddress)) {
    return bot.sendMessage(userId, '❌ Invalid token address');
  }
  
  bot.sendMessage(userId, '⏳ Sniping...');
  
  try {
    const result = await tradingEngine.buyToken(user.privateKey, tokenAddress, ethAmount);
    await database.updateStats(userId, ethAmount);
    
    bot.sendMessage(userId, `
✅ *SNIPED!*
🔗 [Tx Hash](https://basescan.org/tx/${result.txHash})
    `, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (error) {
    bot.sendMessage(userId, `❌ Failed: ${error.message}`);
  }
});

// Sell
bot.onText(/\/sell(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `💰 Usage: \`/sell <token> <percent>\``, { parse_mode: 'Markdown' });
  }
  
  const tokenAddress = match[1].trim();
  const percentage = parseInt(match[2].trim());
  
  bot.sendMessage(userId, '⏳ Selling...');
  
  try {
    const result = await tradingEngine.sellToken(user.privateKey, tokenAddress, percentage);
    bot.sendMessage(userId, `
✅ *SOLD!*
🔗 [Tx Hash](https://basescan.org/tx/${result.txHash})
    `, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (error) {
    bot.sendMessage(userId, `❌ Failed: ${error.message}`);
  }
});

// Withdraw
bot.onText(/\/withdraw(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `💸 Usage: \`/withdraw <amount> <address>\``, { parse_mode: 'Markdown' });
  }

  const amount = match[1].trim();
  const destAddress = match[2].trim();

  if (!ethers.utils.isAddress(destAddress)) {
    return bot.sendMessage(userId, '❌ Invalid address');
  }

  bot.sendMessage(userId, '⏳ Withdrawing...');
  
  try {
    const wallet = walletManager.getWallet(user.privateKey);
    const tx = await wallet.sendTransaction({
      to: destAddress,
      value: ethers.utils.parseEther(amount)
    });
    await tx.wait();
    
    bot.sendMessage(userId, `✅ Sent! Tx: \`${tx.hash}\``, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(userId, `❌ Failed: ${error.message}`);
  }
});

// Help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.from.id, `
📖 *Commands:*
/buy <token> <eth>
/sell <token> <percent>
/balance
/deposit
/withdraw <amount> <address>
  `, { parse_mode: 'Markdown' });
});

// Hibakezelés
bot.on('polling_error', (error) => {
  console.log('Polling error:', error.code);
});

console.log('🎯 SnipeX Bot started on Base!');
