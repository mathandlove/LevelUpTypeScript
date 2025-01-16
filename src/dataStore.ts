// Define the structure of our stored data
interface DocumentData {
  documentId: string;
  lastUpdated: number;
  currentToken?: string;
}

// Main data store with double-key lookup
interface DataStore {
  [clientId: string]: {
    [documentId: string]: DocumentData;
  };
}

// Initialize the store
const store: DataStore = {};

// Helper functions to manage the store
const dataStore = {
  storeData: (clientId: string, documentId: string, data: DocumentData) => {
    if (!store[clientId]) {
      store[clientId] = {};
    }
    store[clientId][documentId] = data;
  },

  getData: (clientId: string, documentId: string): DocumentData | null => {
    return store[clientId]?.[documentId] || null;
  },

  // Optional: get all documents for a client
  getClientDocs: (clientId: string) => {
    return store[clientId] || {};
  },
};

export default dataStore;
