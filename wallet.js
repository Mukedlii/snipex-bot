const { ethers } = require('ethers');
const config = require('./config');

const provider = new ethers.providers.JsonRpcProvider(config.eth.rpcUrl);

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
    return ethers.utils.formatEther(balance);
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
      balance: ethers.utils.formatUnits(balance, decimals),
      symbol,
      decimals
    };
  }
}

module.exports = new WalletManager();