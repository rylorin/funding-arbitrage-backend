import { isAddress, getAddress } from 'ethers';
import { getProvider } from '../../config/web3';

export class WalletService {
  private provider = getProvider();

  public isValidAddress(address: string): boolean {
    return isAddress(address);
  }

  public checksumAddress(address: string): string {
    return getAddress(address);
  }

  public async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return balance.toString();
    } catch (error) {
      console.error('Error fetching balance:', error);
      throw new Error('Failed to fetch wallet balance');
    }
  }

  public async getTransactionCount(address: string): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address);
    } catch (error) {
      console.error('Error fetching transaction count:', error);
      throw new Error('Failed to fetch transaction count');
    }
  }

  public async isContract(address: string): Promise<boolean> {
    try {
      const code = await this.provider.getCode(address);
      return code !== '0x';
    } catch (error) {
      console.error('Error checking if address is contract:', error);
      return false;
    }
  }

  public async validateWallet(address: string): Promise<{
    valid: boolean;
    checksummed?: string;
    balance?: string;
    transactionCount?: number;
    isContract?: boolean;
    error?: string;
  }> {
    try {
      if (!this.isValidAddress(address)) {
        return { valid: false, error: 'Invalid wallet address format' };
      }

      const checksummed = this.checksumAddress(address);
      const [balance, transactionCount, isContract] = await Promise.all([
        this.getBalance(checksummed),
        this.getTransactionCount(checksummed),
        this.isContract(checksummed),
      ]);

      return {
        valid: true,
        checksummed,
        balance,
        transactionCount,
        isContract,
      };
    } catch (error) {
      console.error('Wallet validation error:', error);
      return { valid: false, error: 'Failed to validate wallet' };
    }
  }

  public extractAddressFromMessage(message: string): string | null {
    const addressRegex = /Wallet:\s*(0x[a-fA-F0-9]{40})/;
    const match = message.match(addressRegex);
    return match ? match[1] : null;
  }

  public normalizeAddress(address: string): string {
    return address.toLowerCase();
  }
}

export const walletService = new WalletService();