FROM node:20.9.0

WORKDIR /app

# Copy package.json and yarn.lock first
COPY yarn.lock ./

# Install dependencies
RUN yarn install

# Copy the rest of the application files
COPY . .

# Expose ports
EXPOSE 3001 
EXPOSE 3002 
EXPOSE 3003

# Start the application
CMD ["yarn", "start"]
