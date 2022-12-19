FROM node:latest
WORKDIR /usr/src/app
RUN mkdir dstorage-common
COPY ./dstorage-common ./dstorage-common
WORKDIR ./dstorage-common
RUN npm install
RUN npm run build
WORKDIR ../
RUN mkdir vnode
COPY vnode/package*.json vnode/.env ./vnode/
WORKDIR ./vnode
RUN npm install
COPY ./vnode .
RUN npm link ../dstorage-common
EXPOSE 4001
CMD ["npm", "start"]