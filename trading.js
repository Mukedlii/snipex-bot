const { ethers } = require('ethers');
const config = require('./config');
const walletManager = require('./wallet');

// Base WETH cím (ez hiányzott)
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

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
    // JAVÍTVA: config.eth helyett config.network
    const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);
    
    this.router = new ethers.Contract(
      config.routerAddress, // JAVÍTVA: routerV2 helyett routerAddress
      ROUTER_ABI,
      provider
    );
  }

  async buyToken(userPrivateKey, tokenAddress, ethAmount) {
    const wallet = walletManager.getWallet(userPrivateKey);
    const routerWithSigner = this.router.connect(wallet);

    // Calculate fee
    const ethAmountBN = ethers.utils.parseEther(ethAmount);
    
    // JAVÍTVA: Fix 1% díj számítása (BigNumberrel nem lehet tizedest szorozni)
    const feeAmount = ethAmountBN.div(100); 
    
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
    const path = [WETH_ADDRESS, tokenAddress]; // JAVÍTVA: WETH használata
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
    // JAVÍTVA: routerV2 helyett routerAddress
    const allowance = await tokenContract.allowance(wallet.address, config.routerAddress);
    if (allowance.lt(sellAmount)) {
      const approveTx = await tokenContract.approve(
        config.routerAddress, 
        ethers.constants.MaxUint256
      );
      await approveTx.wait();
    }

    // Execute swap
    const path = [tokenAddress, WETH_ADDRESS]; // JAVÍTVA: WETH
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
    const feeAmount = receivedETH.div(100); // 1% fee
    
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
