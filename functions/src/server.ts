import express, { Request, Response } from "express";
import cors from "cors";
import { initializeWebSocket } from "./websocket";
import { createServer } from "http";

const app = express();
const port = process.env.PORT || 8080; // Cloud Run requires port 8080

// ✅ Set CSP headers to allow WebSocket connections
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' wss://websocket-server-1075091769384.us-central1.run.app;"
  );
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  next();
});

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "connect-src 'self' wss://websocket-server-1075091769384.us-central1.run.app;"
  );
  next();
});

app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Origin"],
  })
);

// Create HTTP server from Express app
const server = createServer(app);

// Initialize WebSocket server
initializeWebSocket(server);

// Health check route for Cloud Run
app.get("/", (req: Request, res: Response) => {
  res.send("✅ WebSocket Server is Running!");
});

// Start the server
server.listen(port, () => {
  console.log(`🔥 WebSocket server running at http://localhost:${port}`);
});
