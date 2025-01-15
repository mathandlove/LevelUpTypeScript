import express, { Request, Response } from "express";
import dataStore from "./dataStore";

const app = express();
const port = 3000;

app.use(express.json()); // Parse incoming JSON requests

// Define the shape of the expected request body
interface StoreDataRequestBody {
  token: string;
  documentId: string;
}

// POST endpoint to store data
app.post(
  "/store-data",
  (req: Request<{}, {}, StoreDataRequestBody>, res: Response) => {
    const { token, documentId } = req.body;

    if (!token || !documentId) {
      return res.status(400).send("Missing token or documentId");
    }

    dataStore.storeData(token, { documentId, lastUpdated: Date.now() });
    res.send("Data stored successfully!");
  }
);

// GET endpoint to retrieve data
app.get("/get-data/:token", (req: Request, res: Response) => {
  const token = req.params.token;
  const data = dataStore.getData(token);

  if (!data) {
    return res.status(404).send("No data found for this token");
  }

  res.json(data);
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
