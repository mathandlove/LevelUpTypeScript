interface DataEntry {
  documentId: string;
  lastUpdated: number;
}

const dataStore: Record<string, DataEntry> = {};

export default {
  storeData: (token: string, data: DataEntry): void => {
    dataStore[token] = data;
    console.log(`Data stored for token: ${token}`);
  },
  getData: (token: string): DataEntry | null => {
    return dataStore[token] || null;
  },
};
