const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');
const config = require('./config');
const database = require('./database');
const walletManager = require('./wallet');
const tradingEngine = require('./trading');

const bot = new TelegramBot(config.telegram.token, { polling: true });

const welcomeArt = `
╔═══════════════════════════╗
║      ⚡ SNIPEX BOT ⚡      ║
║       BASE EDITION        ║
╚═══════════════════════════╝
`;

// Start command
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  
  let user = await database.getUser(userId);
  
  if (!user) {
    const newWallet = walletManager.createWallet();
    await database.saveUser(userId, newWallet.privateKey, newWallet.address);
    
    bot.sendMessage(userId, `
${welcomeArt}

🎯 *Welcome to SnipeX (Base)!*

Your wallet has been created:
\`${newWallet.address}\`

⚡ *How it works:*
1. Deposit ETH to your wallet (Base Network!)
2. Trade tokens instantly via commands
3. Your keys, your crypto

💰 *Fees:*
• Trading: ${config.fees.tradingFeePercent}% per swap
• Withdrawal: ${config.fees.withdrawalFee} ETH

🚀 *Quick Start:*
/deposit - Get your deposit address
/balance - Check wallet balance
/help - Full command list
    `, { parse_mode: 'Markdown' });
  } else {
    const balance = await walletManager.getBalance(user.address);
    bot.sendMessage(userId, `
${welcomeArt}

Welcome back, Sniper! 👋

💼 Wallet: \`${user.address.slice(0,6)}...${user.address.slice(-4)}\`
💰 Balance: ${parseFloat(balance).toFixed(4)} ETH (Base)
📊 Total Trades: ${user.totalTrades}

Ready to snipe on Base? 🔵
    `, { parse_mode: 'Markdown' });
  }
});

// Deposit command - JAVÍTVA: Base hálózat figyelmeztetés
bot.onText(/\/deposit/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  bot.sendMessage(userId, `
💰 *Deposit ETH (Base Network)*

Send ETH to this address:
\`${user.address}\`

⚠️ *IMPORTANT:*
• Send only on **BASE NETWORK** (L2) 🔵
• DO NOT send from Ethereum Mainnet!
• Minimum: ${config.limits.minTradeETH} ETH
• Funds arrive instantly

Check balance with /balance
  `, { parse_mode: 'Markdown' });
});

// Balance command
bot.onText(/\/balance/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  try {
    const balance = await walletManager.getBalance(user.address);
    const balanceFloat = parseFloat(balance);
    
    let status = '🔴 Low balance';
    if (balanceFloat > 0.1) status = '🟢 Ready to trade';
    else if (balanceFloat > 0.01) status = '🟡 Ready';
    
    bot.sendMessage(userId, `
📊 *SnipeX Wallet (Base)*

${status}

💰 Balance: *${balanceFloat.toFixed(6)} ETH*
📈 Total Trades: ${user.totalTrades}
💵 Total Volume: ${parseFloat(user.totalVolume || 0).toFixed(4)} ETH

📍 Address: \`${user.address}\`

${balanceFloat < 0.01 ? '\n⚠️ Deposit ETH on Base Network to start' : ''}
    `, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(userId, '❌ Error fetching balance. Try again.');
  }
});

// Buy command
bot.onText(/\/buy(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `
🎯 *Buy Tokens (Base)*

*Usage:*
\`/buy <token_address> <eth_amount>\`

*Example:*
\`/buy 0x1234...5678 0.1\`

*Limits:*
• Min: ${config.limits.minTradeETH} ETH
• Max: ${config.limits.maxTradeETH} ETH
• Fee: ${config.fees.tradingFeePercent}% per trade
    `, { parse_mode: 'Markdown' });
  }
  
  const tokenAddress = match[1].trim();
  const ethAmount = match[2].trim();
  
  if (!ethers.utils.isAddress(tokenAddress)) {
    return bot.sendMessage(userId, '❌ Invalid token address');
  }
  
  const amountFloat = parseFloat(ethAmount);
  if (isNaN(amountFloat) || amountFloat < parseFloat(config.limits.minTradeETH)) {
    return bot.sendMessage(userId, `❌ Minimum trade: ${config.limits.minTradeETH} ETH`);
  }
  
  // Balance check
  const balance = await walletManager.getBalance(user.address);
  if (parseFloat(balance) < amountFloat) {
    return bot.sendMessage(userId, `❌ Insufficient Base ETH balance\n\nAvailable: ${balance} ETH`);
  }
  
  const processingMsg = await bot.sendMessage(userId, '⏳ *Sniping on Base...*\n\n🎯 Preparing transaction\n⚡ Executing swap', { parse_mode: 'Markdown' });
  
  try {
    const result = await tradingEngine.buyToken(user.privateKey, tokenAddress, ethAmount);
    await database.updateStats(userId, ethAmount);
    
    bot.editMessageText(`
✅ *SNIPED!*

💰 Amount: ${ethAmount} ETH
🎯 Token: \`${tokenAddress.slice(0,6)}...${tokenAddress.slice(-4)}\`
💸 Fee: ${result.feeCharged} ETH

🔗 TX Hash:
\`${result.txHash}\`

[View on Basescan](https://basescan.org/tx/${result.txHash})

🚀 Trade more with /buy
    `, {
      chat_id: userId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.editMessageText(`
❌ *Snipe Failed*

Error: ${error.message}
    `, {
      chat_id: userId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown'
    });
  }
});

// Sell command
bot.onText(/\/sell(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) return bot.sendMessage(userId, '❌ Use /start first');
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `
💰 *Sell Tokens*

*Usage:*
\`/sell <token_address> <percentage>\`

*Example:*
\`/sell 0x1234...5678 50\`
    `, { parse_mode: 'Markdown' });
  }
  
  const tokenAddress = match[1].trim();
  const percentage = parseInt(match[2].trim());
  
  const processingMsg = await bot.sendMessage(userId, '⏳ *Selling on Base...*', { parse_mode: 'Markdown' });
  
  try {
    const result = await tradingEngine.sellToken(user.privateKey, tokenAddress, percentage);
    
    bot.editMessageText(`
✅ *SOLD!*

📉 Sold: ${percentage}%
🎯 Token: \`${tokenAddress.slice(0,6)}...${tokenAddress.slice(-4)}\`
💸 Fee: ${result.feeCharged} ETH

🔗 TX Hash:
\`${result.txHash}\`

[View on Basescan](https://basescan.org/tx/${result.txHash})
    `, {
      chat_id: userId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.editMessageText(`❌ Sell Failed: ${error.message}`, {
      chat_id: userId,
      message_id: processingMsg.message_id
    });
  }
});

// Withdraw command
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
  
  bot.sendMessage(userId, '⏳ Withdrawing from Base...');
  
  try {
    const wallet = walletManager.getWallet(user.privateKey);
    
    // Send fee
    const feeTx = await wallet.sendTransaction({
      to: config.feeWallet,
      value: ethers.utils.parseEther(config.fees.withdrawalFee)
    });
    await feeTx.wait();
    
    // Send funds
    const tx = await wallet.sendTransaction({
      to: destAddress,
      value: ethers.utils.parseEther(amount)
    });
    
    bot.sendMessage(userId, `
✅ *Withdrawal Successful!*

💰 Amount: ${amount} ETH
🔗 [View on Basescan](https://basescan.org/tx/${tx.hash})
    `, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (error) {
    bot.sendMessage(userId, `❌ Withdrawal failed: ${error.message}`);
  }
});

// Help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.from.id, `
${welcomeArt}

📖 *SnipeX Commands (Base)*

*Trading:*
/buy <token> <eth> - Buy tokens
/sell <token> <percent> - Sell tokens
/balance - Check Base ETH balance

*Wallet:*
/deposit - Get Base deposit address
/withdraw <amount> <address> - Withdraw ETH
/stats - Your trading stats

*Info:*
Fees: ${config.fees.tradingFeePercent}%
Network: Base (L2) 🔵
  `, { parse_mode: 'Markdown' });
});

// Error logging
bot.on('polling_error', (error) => {
  console.log('Polling error:', error.code); // Csak a kód, hogy ne szemetelje tele a logot
});

console.log('🎯 SnipeX Bot is running on Base Network!');
