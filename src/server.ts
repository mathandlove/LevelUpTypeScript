import express, { Request, Response } from "express";
import cors from "cors";
import { initializeWebSocket } from "./websocket.js";
import { createServer } from "http";
import path from "path";
import { getActiveStates } from "./stateMachine.js";

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

// Add monitoring endpoint
app.get("/monitor", (req: Request, res: Response) => {
  try {
    const states = getActiveStates();
    res.json(Array.from(states));
  } catch (error) {
    console.error("Error in /monitor endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create HTTP server from Express app
const server = createServer(app);

// Initialize WebSocket server with HTTP server
initializeWebSocket(server);

// Start the server using the HTTP server, not the Express app
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
