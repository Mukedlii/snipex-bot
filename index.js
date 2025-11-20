const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const database = require('./database');
const walletManager = require('./wallet');
const tradingEngine = require('./trading');

const bot = new TelegramBot(config.telegram.token, { polling: true });

// Welcome ASCII art
const welcomeArt = `
╔═══════════════════════════╗
║      ⚡ SNIPEX BOT ⚡      ║
║   Snipe. Swap. Profit.    ║
╚═══════════════════════════╝
`;

// Start command - SnipeX branded
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  
  let user = await database.getUser(userId);
  
  if (!user) {
    const newWallet = walletManager.createWallet();
    await database.saveUser(userId, newWallet.privateKey, newWallet.address);
    
    bot.sendMessage(userId, `
${welcomeArt}

🎯 *Welcome to SnipeX!*

Your non-custodial wallet has been created:
\`${newWallet.address}\`

⚡ *How it works:*
1. Deposit ETH to your wallet
2. Trade tokens instantly via commands
3. Your keys, your crypto - we never hold funds

💰 *Fees:*
• Trading: ${config.fees.tradingFeePercent}% per swap
• Withdrawal: ${config.fees.withdrawalFee} ETH

🚀 *Quick Start:*
/deposit - Get your deposit address
/balance - Check wallet balance
/buy - Buy tokens instantly
/help - Full command list

Built by snipers, for traders 🎯
    `, { parse_mode: 'Markdown' });
  } else {
    const balance = await walletManager.getBalance(user.address);
    bot.sendMessage(userId, `
${welcomeArt}

Welcome back, Sniper! 👋

💼 Wallet: \`${user.address.slice(0,6)}...${user.address.slice(-4)}\`
💰 Balance: ${parseFloat(balance).toFixed(4)} ETH
📊 Total Trades: ${user.totalTrades}

Ready to snipe? Use /help for commands
    `, { parse_mode: 'Markdown' });
  }
});

// Deposit command
bot.onText(/\/deposit/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) {
    return bot.sendMessage(userId, '❌ Use /start first');
  }
  
  bot.sendMessage(userId, `
💰 *Deposit ETH*

Send ETH to this address:
\`${user.address}\`

⚠️ *Important:*
• Only send ETH (Ethereum mainnet)
• Minimum: ${config.limits.minTradeETH} ETH
• Funds arrive instantly

Check balance with /balance
  `, { parse_mode: 'Markdown' });
});

// Balance command - Enhanced
bot.onText(/\/balance/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) {
    return bot.sendMessage(userId, '❌ Use /start first');
  }
  
  try {
    const balance = await walletManager.getBalance(user.address);
    const balanceFloat = parseFloat(balance);
    
    let status = '🔴 Low balance';
    if (balanceFloat > 0.1) status = '🟢 Ready to trade';
    else if (balanceFloat > 0.01) status = '🟡 Ready';
    
    bot.sendMessage(userId, `
📊 *SnipeX Wallet*

${status}

💰 ETH Balance: *${balanceFloat.toFixed(6)} ETH*
📈 Total Trades: ${user.totalTrades}
💵 Total Volume: ${parseFloat(user.totalVolume || 0).toFixed(4)} ETH

📍 Address: \`${user.address}\`

${balanceFloat < 0.01 ? '\n⚠️ Deposit more ETH to start trading\n/deposit for instructions' : ''}
    `, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(userId, '❌ Error fetching balance. Try again.');
  }
});

// Buy command - SnipeX style
bot.onText(/\/buy(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) {
    return bot.sendMessage(userId, '❌ Use /start first');
  }
  
  // If no args, show help
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `
🎯 *Buy Tokens*

*Usage:*
\`/buy <token_address> <eth_amount>\`

*Example:*
\`/buy 0x1234...5678 0.1\`

*Limits:*
• Min: ${config.limits.minTradeETH} ETH
• Max: ${config.limits.maxTradeETH} ETH
• Fee: ${config.fees.tradingFeePercent}% per trade

⚡ Execution time: ~5-15 seconds
    `, { parse_mode: 'Markdown' });
  }
  
  const tokenAddress = match[1].trim();
  const ethAmount = match[2].trim();
  
  // Validation
  if (!ethAddress.isAddress(tokenAddress)) {
    return bot.sendMessage(userId, '❌ Invalid token address');
  }
  
  const amountFloat = parseFloat(ethAmount);
  if (isNaN(amountFloat) || amountFloat < parseFloat(config.limits.minTradeETH)) {
    return bot.sendMessage(userId, `❌ Minimum trade: ${config.limits.minTradeETH} ETH`);
  }
  
  if (amountFloat > parseFloat(config.limits.maxTradeETH)) {
    return bot.sendMessage(userId, `❌ Maximum trade: ${config.limits.maxTradeETH} ETH`);
  }
  
  // Check balance
  const balance = await walletManager.getBalance(user.address);
  if (parseFloat(balance) < amountFloat) {
    return bot.sendMessage(userId, `❌ Insufficient balance\n\nYour balance: ${balance} ETH\nRequired: ${ethAmount} ETH\n\nUse /deposit to add funds`);
  }
  
  const processingMsg = await bot.sendMessage(userId, '⏳ *Sniping target...*\n\n🎯 Preparing transaction\n⚡ Executing swap\n⏱️ ~10 seconds', { parse_mode: 'Markdown' });
  
  try {
    const result = await tradingEngine.buyToken(user.privateKey, tokenAddress, ethAmount);
    
    await database.updateStats(userId, ethAmount);
    
    bot.editMessageText(`
✅ *SNIPED!*

💰 Amount: ${ethAmount} ETH
🎯 Token: \`${tokenAddress.slice(0,6)}...${tokenAddress.slice(-4)}\`
💸 Fee: ${result.feeCharged} ETH (${config.fees.tradingFeePercent}%)

🔗 TX Hash:
\`${result.txHash}\`

[View on Etherscan](https://etherscan.io/tx/${result.txHash})

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

💡 *Common issues:*
• Insufficient liquidity
• High slippage (token tax?)
• Gas price too low

Try again or contact ${config.branding.support}
    `, {
      chat_id: userId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown'
    });
  }
});

// Sell command - SnipeX style
bot.onText(/\/sell(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) {
    return bot.sendMessage(userId, '❌ Use /start first');
  }
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `
💰 *Sell Tokens*

*Usage:*
\`/sell <token_address> <percentage>\`

*Example:*
\`/sell 0x1234...5678 50\`

Sells 50% of your token balance

*Percentage:* 1-100
*Fee:* ${config.fees.tradingFeePercent}% of ETH received

⚡ Execution time: ~5-15 seconds
    `, { parse_mode: 'Markdown' });
  }
  
  const tokenAddress = match[1].trim();
  const percentage = parseInt(match[2].trim());
  
  if (isNaN(percentage) || percentage < 1 || percentage > 100) {
    return bot.sendMessage(userId, '❌ Percentage must be between 1-100');
  }
  
  const processingMsg = await bot.sendMessage(userId, '⏳ *Executing sell...*\n\n💰 Checking balance\n🔄 Approving token\n⚡ Swapping to ETH', { parse_mode: 'Markdown' });
  
  try {
    const result = await tradingEngine.sellToken(user.privateKey, tokenAddress, percentage);
    
    bot.editMessageText(`
✅ *SOLD!*

📉 Sold: ${percentage}% of position
🎯 Token: \`${tokenAddress.slice(0,6)}...${tokenAddress.slice(-4)}\`
💸 Fee: ${result.feeCharged} ETH (${config.fees.tradingFeePercent}%)

🔗 TX Hash:
\`${result.txHash}\`

[View on Etherscan](https://etherscan.io/tx/${result.txHash})

💰 Check balance: /balance
    `, {
      chat_id: userId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    bot.editMessageText(`
❌ *Sell Failed*

Error: ${error.message}

💡 Make sure you own this token
Check balance with /balance

Contact ${config.branding.support} if issue persists
    `, {
      chat_id: userId,
      message_id: processingMsg.message_id,
      parse_mode: 'Markdown'
    });
  }
});

// Withdraw command
bot.onText(/\/withdraw(?:\s+(.+)\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) {
    return bot.sendMessage(userId, '❌ Use /start first');
  }
  
  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(userId, `
💸 *Withdraw ETH*

*Usage:*
\`/withdraw <amount> <destination_address>\`

*Example:*
\`/withdraw 0.5 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\`

*Fee:* ${config.fees.withdrawalFee} ETH per withdrawal

⚠️ Double-check destination address!
    `, { parse_mode: 'Markdown' });
  }
  
  const amount = match[1].trim();
  const destAddress = match[2].trim();
  
  // Validation
  const { ethers } = require('ethers');
  if (!ethers.utils.isAddress(destAddress)) {
    return bot.sendMessage(userId, '❌ Invalid destination address');
  }
  
  const amountFloat = parseFloat(amount);
  if (isNaN(amountFloat) || amountFloat <= 0) {
    return bot.sendMessage(userId, '❌ Invalid amount');
  }
  
  const balance = await walletManager.getBalance(user.address);
  const totalNeeded = amountFloat + parseFloat(config.fees.withdrawalFee);
  
  if (parseFloat(balance) < totalNeeded) {
    return bot.sendMessage(userId, `❌ Insufficient balance\n\nAvailable: ${balance} ETH\nNeeded: ${totalNeeded} ETH (incl. ${config.fees.withdrawalFee} ETH fee)`);
  }
  
  bot.sendMessage(userId, '⏳ Processing withdrawal...');
  
  try {
    const wallet = walletManager.getWallet(user.privateKey);
    
    // Send withdrawal fee
    const feeTx = await wallet.sendTransaction({
      to: config.feeWallet,
      value: ethers.utils.parseEther(config.fees.withdrawalFee)
    });
    await feeTx.wait();
    
    // Send main amount
    const tx = await wallet.sendTransaction({
      to: destAddress,
      value: ethers.utils.parseEther(amount)
    });
    const receipt = await tx.wait();
    
    bot.sendMessage(userId, `
✅ *Withdrawal Successful!*

💰 Amount: ${amount} ETH
📍 To: \`${destAddress.slice(0,6)}...${destAddress.slice(-4)}\`
💸 Fee: ${config.fees.withdrawalFee} ETH

🔗 TX Hash:
\`${receipt.transactionHash}\`

[View on Etherscan](https://etherscan.io/tx/${receipt.transactionHash})
    `, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (error) {
    bot.sendMessage(userId, `❌ Withdrawal failed: ${error.message}`);
  }
});

// Stats command
bot.onText(/\/stats/, async (msg) => {
  const userId = msg.from.id;
  const user = await database.getUser(userId);
  
  if (!user) {
    return bot.sendMessage(userId, '❌ Use /start first');
  }
  
  const balance = await walletManager.getBalance(user.address);
  const joined = new Date(user.createdAt * 1000).toLocaleDateString();
  
  bot.sendMessage(userId, `
📊 *Your SnipeX Stats*

👤 User ID: \`${userId}\`
📅 Joined: ${joined}
💰 Current Balance: ${parseFloat(balance).toFixed(6)} ETH
📈 Total Trades: ${user.totalTrades}
💵 Total Volume: ${parseFloat(user.totalVolume || 0).toFixed(4)} ETH

🎯 Keep sniping!
  `, { parse_mode: 'Markdown' });
});

// Help command - Complete
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.from.id, `
${welcomeArt}

📖 *SnipeX Commands*

*Trading:*
/buy <token> <eth> - Buy tokens
/sell <token> <percent> - Sell tokens
/balance - Check wallet balance

*Wallet:*
/deposit - Get deposit address
/withdraw <amount> <address> - Withdraw ETH
/stats - Your trading statistics

*Info:*
/help - Show this message
/support - Get support

*Fees:*
• Trading: ${config.fees.tradingFeePercent}% per swap
• Withdrawal: ${config.fees.withdrawalFee} ETH

*Features:*
⚡ Lightning-fast execution
🔒 Non-custodial (your keys)
🎯 Built by snipers, for traders

🌐 Website: ${config.branding.website}
🐦 Twitter: ${config.branding.twitter}
💬 Support: ${config.branding.support}
  `, { parse_mode: 'Markdown' });
});

// Support command
bot.onText(/\/support/, (msg) => {
  bot.sendMessage(msg.from.id, `
💬 *SnipeX Support*

Need help? Contact us:

📧 Telegram: ${config.branding.support}
🐦 Twitter: ${config.branding.twitter}
🌐 Website: ${config.branding.website}

*Common Issues:*
• Transaction failed → Check gas/liquidity
• Can't sell → Token may have sell tax
• Withdrawal issues → Check address format

We typically respond within 1-2 hours ⚡
  `, { parse_mode: 'Markdown' });
});

// Error handling
bot.on('polling_error', (error) => {
  console.log('Polling error:', error);
});

console.log('🎯 SnipeX Bot is running...');
console.log(`⚡ ${config.branding.tagline}`);