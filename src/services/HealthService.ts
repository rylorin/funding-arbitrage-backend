import { jobManager } from "@/jobs";
import { connectDatabase } from "../config/database";
import { JobResult } from "../types/index";
import { extendedExchange, hyperliquidExchange, vestExchange, woofiExchange } from "./exchanges/index";

interface HealthStatus {
  status: "healthy" | "warning" | "unhealthy";
  message: string;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  database: {
    status: "connected" | "disconnected" | "error";
    message?: string;
  };
  exchanges: Record<
    string,
    {
      status: "connected" | "disconnected" | "error";
      message?: string;
      lastChecked: string;
    }
  >;
  jobs: {
    overall: "healthy" | "warning" | "unhealthy";
    jobs: Record<string, any>;
    summary: {
      total: number;
      running: number;
      stopped: number;
      errors: number;
    };
  };
}

export class HealthService {
  private isRunning = false;
  private lastHealthStatus: HealthStatus | null = null;

  private exchanges = {
    vest: vestExchange,
    hyperliquid: hyperliquidExchange,
    orderly: woofiExchange,
    extended: extendedExchange,
  };

  public async executeHealthCheck(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return {
        success: false,
        message: "Health check already in progress",
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;

    try {
      console.log("🏥 Starting health check...");

      // Check database connection
      const databaseHealth = await this.checkDatabaseHealth();

      // Check exchange connections
      const exchangesHealth = await this.checkExchangesHealth();

      // Get system information
      const systemHealth = this.getSystemHealth();

      const jobsHealth = await jobManager.getHealthCheck();

      // Overall status determination
      const overallStatus = this.determineOverallStatus(databaseHealth, exchangesHealth, systemHealth, jobsHealth);

      const healthStatus: HealthStatus = {
        status: overallStatus,
        message: this.getStatusMessage(overallStatus),
        timestamp: new Date().toISOString(),
        ...systemHealth,
        database: databaseHealth,
        exchanges: exchangesHealth,
        jobs: jobsHealth,
      };

      this.lastHealthStatus = healthStatus;
      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: overallStatus !== "unhealthy",
        message: `Health check completed: ${overallStatus}`,
        data: healthStatus,
        executionTime,
      };

      if (overallStatus === "unhealthy") {
        console.log(`❌ Health check completed with issues: ${result.message}`);
      } else if (overallStatus === "warning") {
        console.log(`⚠️  Health check completed with warnings: ${result.message}`);
      } else {
        console.log(`✅ Health check completed successfully: ${result.message}`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Health check failed:", error);

      return {
        success: false,
        message: "Health check failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async checkDatabaseHealth(): Promise<{
    status: "connected" | "disconnected" | "error";
    message?: string;
  }> {
    try {
      // Test database connection by attempting a simple query
      // This is a simplified check - in a real implementation, you'd use a proper health check
      await connectDatabase();
      return { status: "connected" };
    } catch (error) {
      console.error("Database health check failed:", error);
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Database connection failed",
      };
    }
  }

  private async checkExchangesHealth(): Promise<
    Record<
      string,
      {
        status: "connected" | "disconnected" | "error";
        message?: string;
        lastChecked: string;
      }
    >
  > {
    const results: any = {};

    for (const [exchangeName, exchange] of Object.entries(this.exchanges)) {
      try {
        // For each exchange, check if it's connected and can fetch basic data
        const isConnected = exchange?.isConnected;

        if (isConnected) {
          // Try to fetch funding rates for a basic token to verify API connectivity
          await exchange.getFundingRates(["BTC"]);
          results[exchangeName] = {
            status: "connected",
            lastChecked: new Date().toISOString(),
          };
        } else {
          results[exchangeName] = {
            status: "disconnected",
            message: "Exchange not connected",
            lastChecked: new Date().toISOString(),
          };
        }
      } catch (error) {
        console.warn(`Exchange ${exchangeName} health check failed:`, error);
        results[exchangeName] = {
          status: "error",
          message: error instanceof Error ? error.message : "Health check failed",
          lastChecked: new Date().toISOString(),
        };
      }
    }

    return results;
  }

  private getSystemHealth(): {
    uptime: number;
    version: string;
    environment: string;
  } {
    return {
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    };
  }

  private determineOverallStatus(
    database: any,
    exchanges: any,
    _system: any,
    jobs: any,
  ): "healthy" | "warning" | "unhealthy" {
    // If database is not connected, system is unhealthy
    if (database.status !== "connected") {
      return "unhealthy";
    }

    // Count exchange issues
    const exchangeStatuses = Object.values(exchanges);
    const connectedExchanges = exchangeStatuses.filter((status: any) => status.status === "connected").length;
    const totalExchanges = exchangeStatuses.length;

    // If more than half of exchanges are down, system is unhealthy
    if (connectedExchanges < totalExchanges / 2) {
      return "unhealthy";
    }

    // If some exchanges are down but majority are working, warning
    if (connectedExchanges < totalExchanges) {
      return "warning";
    }

    if (jobs.overall !== "healthy") {
      return jobs.overall;
    }

    // All systems healthy
    return "healthy";
  }

  private getStatusMessage(status: "healthy" | "warning" | "unhealthy"): string {
    switch (status) {
      case "healthy":
        return "All systems operational";
      case "warning":
        return "Some services experiencing issues";
      case "unhealthy":
        return "Critical systems experiencing issues";
      default:
        return "Unknown status";
    }
  }

  public getLastHealthStatus(): HealthStatus | null {
    return this.lastHealthStatus;
  }
}

const healthService = new HealthService();
export default healthService;
