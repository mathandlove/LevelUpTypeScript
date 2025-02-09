import express, { Request, Response } from "express";
import cors from "cors";
import { initializeWebSocket } from "./websocket.js";
import { createServer } from "http";
import path from "path";

const app = express();
const port = 3000;

app.use(express.json()); // Parse incoming JSON requests

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "ngrok-skip-browser-warning",
      "Accept",
      "Origin",
    ],
  })
);

// Serve static files from the public directory
app.use(express.static("public"));

// Create HTTP server from Express app
const server = createServer(app);

// Initialize WebSocket server with HTTP server
initializeWebSocket(server);

// Start the server using the HTTP server, not the Express app
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
