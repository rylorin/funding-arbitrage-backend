import { defaultSettings } from "@/config/user";
import { verifyMessage } from "ethers";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { web3Config } from "../../config/web3";
import User from "../../models/User";
import { AuthChallenge, AuthTokenPayload } from "../../types/index";

export class AuthService {
  private challenges = new Map<string, AuthChallenge>();

  public generateChallenge(walletAddress: string): AuthChallenge {
    const nonce = uuidv4();
    const message = `Sign this message to authenticate with Funding Arbitrage Platform.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;

    const challenge: AuthChallenge = {
      message,
      nonce,
      expiresAt: Date.now() + web3Config.challengeExpiresIn,
    };

    this.challenges.set(walletAddress.toLowerCase(), challenge);

    setTimeout(() => {
      this.challenges.delete(walletAddress.toLowerCase());
    }, web3Config.challengeExpiresIn);

    return challenge;
  }

  public async verifySignature(
    walletAddress: string,
    signature: string,
    message: string,
  ): Promise<{ success: boolean; user?: User; token?: string; error?: string }> {
    try {
      const normalizedAddress = walletAddress.toLowerCase();
      const challenge = this.challenges.get(normalizedAddress);

      if (!challenge) {
        return { success: false, error: "No active challenge found for this wallet" };
      }

      if (Date.now() > challenge.expiresAt) {
        this.challenges.delete(normalizedAddress);
        return { success: false, error: "Challenge expired" };
      }

      if (message !== challenge.message) {
        return { success: false, error: "Message does not match challenge" };
      }

      const recoveredAddress = verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== normalizedAddress) {
        return { success: false, error: "Signature verification failed" };
      }

      this.challenges.delete(normalizedAddress);

      let user = await User.findOne({ where: { walletAddress: recoveredAddress } });

      if (!user) {
        user = await User.create({
          walletAddress: recoveredAddress,
          settings: defaultSettings,
        });
      }

      const tokenPayload: AuthTokenPayload = {
        walletAddress: user.walletAddress,
        userId: user.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      };

      const token = jwt.sign(tokenPayload, web3Config.jwtSecret);

      return { success: true, user, token };
    } catch (error) {
      console.error("Signature verification error:", error);
      return { success: false, error: "Internal authentication error" };
    }
  }

  public verifyToken(token: string): AuthTokenPayload | null {
    try {
      const decoded = jwt.verify(token, web3Config.jwtSecret) as AuthTokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  public async getUserFromToken(token: string): Promise<User | null> {
    const decoded = this.verifyToken(token);
    if (!decoded) return null;

    try {
      const user = await User.findByPk(decoded.userId);
      return user;
    } catch (error) {
      console.error("Error fetching user from token:", error);
      return null;
    }
  }

  public cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [address, challenge] of this.challenges.entries()) {
      if (now > challenge.expiresAt) {
        this.challenges.delete(address);
      }
    }
  }

  public getChallengeCount(): number {
    return this.challenges.size;
  }
}

export const authService = new AuthService();

setInterval(() => {
  authService.cleanupExpiredChallenges();
}, 60000); // Cleanup every minute
