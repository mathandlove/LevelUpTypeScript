# Use a lightweight Node.js image
FROM node:18

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# ✅ Compile TypeScript before starting the server
RUN npm run build

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

# ✅ Start the compiled JavaScript file from lib/
CMD ["node", "lib/server.js"]
