FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./
RUN npm install --production

# Copy app code
COPY . .

# Ensure storage directories exist
RUN mkdir -p data uploads/slips

# Expose application port
EXPOSE 3838
ENV PORT=3838
ENV NODE_ENV=production

CMD ["node", "server.js"]
