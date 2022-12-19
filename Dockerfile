#VNODE DOKCER IMAGE
# => Build image using command: docker build -t vnode .
# => Comment out the following lines to build the snode image
FROM node:latest
WORKDIR /usr/src/app
RUN mkdir vnode
WORKDIR ./vnode
COPY vnode/package*.json vnode/.env ./
RUN mkdir dstorage-common
COPY ./dstorage-common ./dstorage-common
WORKDIR ./dstorage-common
RUN npm install
RUN npm run build
WORKDIR ../
RUN npm install
RUN npm link ./dstorage-common && ls -la node_modules | grep dstorage
COPY ./vnode .
EXPOSE 4001
CMD ["npm", "start"]

#SNODE DOKCER IMAGE
# => Build image using command: docker build -t snode .
# => Comment out the following lines to build the vnode image
# FROM node:latest
# WORKDIR /usr/src/app
# RUN mkdir snode
# WORKDIR ./snode
# COPY snode/package*.json snode/.env ./
# RUN mkdir dstorage-common
# COPY ./dstorage-common ./dstorage-common
# WORKDIR ./dstorage-common
# RUN npm install
# RUN npm run build
# WORKDIR ../
# RUN npm install
# RUN npm link ./dstorage-common && ls -la node_modules | grep dstorage
# COPY ./snode .
# EXPOSE 4000
# CMD ["npm", "start"]