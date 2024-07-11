FROM node:16.20.2
WORKDIR /app
COPY . .
RUN yarn install
EXPOSE 3001
EXPOSE 3002
CMD ["yarn", "start"]