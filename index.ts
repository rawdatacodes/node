#!/usr/bin/env node

const serverUrl = "ws://localhost:7777";

const connect = (): void => {
  const ws = new WebSocket(serverUrl);

  ws.onopen = () => {
    console.log("Connected to server");
    
    // Send a test message
    ws.send("Hello from client!");
    
    // Send messages periodically
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`Message at ${new Date().toISOString()}`);
      }
    }, 3000);

    ws.onclose = () => clearInterval(interval);
  };

  ws.onmessage = (event) => {
    console.log("Received:", event.data);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log(`Connection closed: ${event.code} ${event.reason}`);
    console.log("Attempting to reconnect in 5 seconds...");
    setTimeout(connect, 5000);
  };
};

connect(); 