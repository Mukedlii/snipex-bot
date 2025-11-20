const { ethers } = require('ethers');
const config = require('./config');
const walletManager = require('./wallet');

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) public view returns (uint256)'
];

class TradingEngine {
  constructor() {
    this.router = new ethers.Contract(
      config.uniswap.routerV2,
      ROUTER_ABI,
      new ethers.providers.JsonRpcProvider(config.eth.rpcUrl)
    );
  }

  async buyToken(userPrivateKey, tokenAddress, ethAmount) {
    const wallet = walletManager.getWallet(userPrivateKey);
    const routerWithSigner = this.router.connect(wallet);

    // Calculate fee
    const ethAmountBN = ethers.utils.parseEther(ethAmount);
    const feeAmount = ethAmountBN.mul(config.fees.tradingFeePercent).div(100);
    const tradeAmount = ethAmountBN.sub(feeAmount);

    // Send fee to fee wallet
    if (feeAmount.gt(0)) {
      const feeTx = await wallet.sendTransaction({
        to: config.feeWallet,
        value: feeAmount
      });
      await feeTx.wait();
    }

    // Execute swap
    const path = [config.uniswap.weth, tokenAddress];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 min

    const amounts = await this.router.getAmountsOut(tradeAmount, path);
    const amountOutMin = amounts[1].mul(95).div(100); // 5% slippage

    const tx = await routerWithSigner.swapExactETHForTokens(
      amountOutMin,
      path,
      wallet.address,
      deadline,
      { value: tradeAmount, gasLimit: 300000 }
    );

    const receipt = await tx.wait();
    return {
      success: true,
      txHash: receipt.transactionHash,
      feeCharged: ethers.utils.formatEther(feeAmount)
    };
  }

  async sellToken(userPrivateKey, tokenAddress, percentage) {
    const wallet = walletManager.getWallet(userPrivateKey);
    const routerWithSigner = this.router.connect(wallet);

    // Get token balance
    const tokenInfo = await walletManager.getTokenBalance(wallet.address, tokenAddress);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    const sellAmount = ethers.utils.parseUnits(tokenInfo.balance, tokenInfo.decimals)
      .mul(percentage)
      .div(100);

    // Check and approve if needed
    const allowance = await tokenContract.allowance(wallet.address, config.uniswap.routerV2);
    if (allowance.lt(sellAmount)) {
      const approveTx = await tokenContract.approve(
        config.uniswap.routerV2,
        ethers.constants.MaxUint256
      );
      await approveTx.wait();
    }

    // Execute swap
    const path = [tokenAddress, config.uniswap.weth];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const amounts = await this.router.getAmountsOut(sellAmount, path);
    const amountOutMin = amounts[1].mul(95).div(100);

    const tx = await routerWithSigner.swapExactTokensForETH(
      sellAmount,
      amountOutMin,
      path,
      wallet.address,
      deadline,
      { gasLimit: 300000 }
    );

    const receipt = await tx.wait();

    // Fee is deducted from received ETH
    const receivedETH = amounts[1];
    const feeAmount = receivedETH.mul(config.fees.tradingFeePercent).div(100);
    
    if (feeAmount.gt(0)) {
      const feeTx = await wallet.sendTransaction({
        to: config.feeWallet,
        value: feeAmount
      });
      await feeTx.wait();
    }

    return {
      success: true,
      txHash: receipt.transactionHash,
      feeCharged: ethers.utils.formatEther(feeAmount)
    };
  }
}

module.exports = new TradingEngine();