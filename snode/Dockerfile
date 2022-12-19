FROM node:latest
WORKDIR /usr/src/app
RUN mkdir dstorage-common
COPY ./dstorage-common ./dstorage-common
WORKDIR ./dstorage-common
RUN npm install
RUN npm run build
WORKDIR ../
RUN mkdir snode
COPY snode/package*.json snode/.env ./snode/
WORKDIR ./snode
RUN npm install
COPY ./snode .
RUN npm link ../dstorage-common
EXPOSE 4001
CMD ["npm", "start"]