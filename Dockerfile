FROM node:22-alpine

WORKDIR /app

# Install native build tools needed for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy root package.json and install backend dependencies
COPY package*.json ./
RUN npm install

# Copy backend source
COPY tsconfig.json ./
COPY src/ ./src/

# Copy frontend source
COPY frontend/ ./frontend/

# Build backend
RUN npm run build

# Build frontend
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Go back to root
WORKDIR /app

# Ensure data directory exists
RUN mkdir -p data

EXPOSE 4000

CMD ["node", "dist/app.js"]
