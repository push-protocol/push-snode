FROM node:18.18.0
WORKDIR /app
COPY . .
RUN yarn install
EXPOSE 3001
EXPOSE 3002
CMD ["yarn", "start"]