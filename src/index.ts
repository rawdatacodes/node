#!/usr/bin/env node

import { ReconnectManager } from "./reconnect.js";

const getServerUrl = (): string => {
  if (process.env.WS_SERVER_URL) {
    return process.env.WS_SERVER_URL;
  }

  if (process.env.NODE_ENV !== "production") {
    return "ws://localhost:7777/ws";
  }

  return "wss://rawdata-server.onrender.com/ws";
};

const serverUrl = getServerUrl();

let ws: WebSocket | null = null;
let messageInterval: Timer | null = null;
let isShuttingDown = false;

const reconnectManager = new ReconnectManager();

const cleanup = (): void => {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
  }
};

const startMessageInterval = (): void => {
  messageInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(`Message at ${new Date().toISOString()}`);
    }
  }, 3000);
};

const connect = (): void => {
  if (isShuttingDown) return;
  
  cleanup();

  console.log(`Connecting to ${serverUrl}... (attempt ${reconnectManager.attempts + 1})`);
  ws = new WebSocket(serverUrl);

  ws.onopen = () => {
    console.log("Connected to server");
    reconnectManager.onSuccessfulConnection();
    ws!.send("Hello from client!");
    startMessageInterval();
  };

  ws.onmessage = (event) => {
    console.log("Received:", event.data);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log(`Connection closed: ${event.code} ${event.reason}`);
    cleanup();

    if (event.code !== 1000 && !isShuttingDown) {
      reconnectManager.scheduleReconnect(connect);
    }
  };
};

connect();

// graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  isShuttingDown = true;
  cleanup();
  reconnectManager.shutdown();
  if (ws) {
    ws.close(1000, "Client shutdown");
  }
  process.exit(0);
});
