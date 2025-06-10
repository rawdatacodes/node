#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import inquirer from "inquirer";
import { ReconnectManager } from "./reconnect.js";
import { handleTwitterLogin } from "./twitter.js";

interface Config {
  rawdata?: {
    apiKey?: string;
  };
  socialNetworks?: {
    xcom?: {
      xcomSession?: string;
    };
  };
}

const CONFIG_FILE = path.resolve(process.cwd(), "config.json");

const loadConfig = (): Config => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(configData);
    }
  } catch (error) {
    console.warn("Warning: Could not load config file, starting fresh");
  }
  return {};
};

const saveConfig = (config: Config): void => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`✅ Configuration saved to ${CONFIG_FILE}`);
  } catch (error) {
    console.error("Error saving config:", error);
  }
};

const promptApiKey = async (): Promise<string> => {
  const answers = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: "Enter your API key:",
      validate: (input: string) => input.trim() !== "" || "API key is required",
    },
  ]);

  return answers.apiKey;
};

const parseArgs = (): { apiKey?: string } => {
  const args = process.argv.slice(2);
  const result: { apiKey?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key" && i + 1 < args.length) {
      result.apiKey = args[i + 1];
      i++; // skip next arg since it's the value
    }
  }
  
  return result;
};

const getApiKey = async (): Promise<string> => {
  // First try command line argument
  const { apiKey: argApiKey } = parseArgs();
  if (argApiKey) {
    return argApiKey;
  }

  // Then try config file
  const config = loadConfig();
  if (config.rawdata?.apiKey) {
    console.log("✅ API key found in configuration");
    return config.rawdata.apiKey;
  }

  // Finally prompt user
  console.log("API key not found. Please provide your API key:");
  const apiKey = await promptApiKey();
  
  // Save to config
  if (!config.rawdata) {
    config.rawdata = {};
  }
  config.rawdata.apiKey = apiKey;
  saveConfig(config);
  
  return apiKey;
};

const apiKey = await getApiKey();

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
let isAuthenticated = false;

const reconnectManager = new ReconnectManager();

const cleanup = (): void => {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
  }
};

const startMessageInterval = (): void => {
  messageInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN && isAuthenticated) {
      ws.send(JSON.stringify({
        type: "heartbeat",
        timestamp: new Date().toISOString()
      }));
    }
  }, 30000); // every 30 seconds
};



const connect = (): void => {
  if (isShuttingDown) return;
  
  cleanup();

  console.log(`Connecting to ${serverUrl}... (attempt ${reconnectManager.attempts + 1})`);
  ws = new WebSocket(serverUrl);

  ws.onopen = () => {
    console.log("🔗 Connected to server");
    reconnectManager.onSuccessfulConnection();
    isAuthenticated = false;
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case "auth_required":
          console.log("🔐 Server requesting authentication...");
          ws!.send(JSON.stringify({
            type: "auth",
            apiKey
          }));
          break;
          
        case "auth_success":
          console.log("✅ WebSocket authentication successful!");
          console.log(`👤 User ID: ${data.userId}`);
          isAuthenticated = true;
          startMessageInterval();
          
          // Start Twitter authentication after WebSocket is connected
          handleTwitterLogin(loadConfig(), saveConfig);
          break;
          
        case "auth_error":
          console.error("❌ Authentication failed:", data.message);
          process.exit(1);
          break;
          
        case "error":
          console.error("❌ Server error:", data.message);
          break;
          
        default:
          console.log("📨 Received:", data);
      }
    } catch (error) {
      // fallback for non-JSON messages
      console.log("📨 Received:", event.data);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log(`🔌 Connection closed: ${event.code} ${event.reason}`);
    cleanup();
    isAuthenticated = false;

    if (event.code !== 1000 && !isShuttingDown) {
      if (event.code === 1008) {
        console.error("❌ Authentication failed. Please check your API key.");
        process.exit(1);
      }
      reconnectManager.scheduleReconnect(connect);
    }
  };
};

console.log("🚀 Starting rawdata.xyz CLI...\n");

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
