FROM node:22-alpine

WORKDIR /usr/src/app

# Copy dependency files first (better caching)
COPY package*.json ./

# Install ALL deps (including nodemon)
RUN npm install

# Copy the rest of the source
COPY . .

# Ensure cache dir exists and is writable
RUN mkdir -p /usr/src/app/cache

EXPOSE 3000

CMD ["npm", "run", "dev"]
