export interface ReconnectConfig {
  baseDelay?: number;
  maxDelay?: number;
  jitterRange?: number;
}

export class ReconnectManager {
  private reconnectAttempts = 0;
  private reconnectTimeout: Timer | null = null;
  private isShuttingDown = false;
  private config: Required<ReconnectConfig>;

  constructor(config: ReconnectConfig = {}) {
    this.config = {
      baseDelay: config.baseDelay ?? 5000,
      maxDelay: config.maxDelay ?? 30000,
      jitterRange: config.jitterRange ?? 0.3,
    };
  }

  private getReconnectDelay(): number {
    // exponential backoff: 5s, 10s, 20s, 30s (capped)
    const exponentialDelay = Math.min(
      this.config.baseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxDelay
    );
    
    // add jitter to prevent thundering herd
    const jitter = (Math.random() - 0.5) * 2 * this.config.jitterRange;
    const jitteredDelay = exponentialDelay * (1 + jitter);
    
    return Math.max(1000, jitteredDelay); // minimum 1 second
  }

  scheduleReconnect(reconnectFn: () => void): void {
    if (this.isShuttingDown) return;

    this.reconnectAttempts++;
    const delay = this.getReconnectDelay();
    console.log(`Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isShuttingDown) {
        reconnectFn();
      }
    }, delay);
  }

  onSuccessfulConnection(): void {
    this.reconnectAttempts = 0;
  }

  shutdown(): void {
    this.isShuttingDown = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  get attempts(): number {
    return this.reconnectAttempts;
  }
} 