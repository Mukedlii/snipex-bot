const { ethers } = require('ethers');
const config = require('./config');

// JAVÍTVA: config.eth helyett config.network, és az új ethers v6 szintaxis
const provider = new ethers.JsonRpcProvider(config.network.rpcUrl);

class WalletManager {
  createWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }

  getWallet(privateKey) {
    return new ethers.Wallet(privateKey, provider);
  }

  async getBalance(address) {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance); // JAVÍTVA: utils nélkül (v6)
  }

  async getTokenBalance(walletAddress, tokenAddress) {
    const tokenAbi = [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ];
    
    const contract = new ethers.Contract(tokenAddress, tokenAbi, provider);
    const balance = await contract.balanceOf(walletAddress);
    const decimals = await contract.decimals();
    const symbol = await contract.symbol();
    
    return {
      balance: ethers.formatUnits(balance, decimals), // JAVÍTVA: utils nélkül (v6)
      symbol,
      decimals
    };
  }
}

module.exports = new WalletManager();
