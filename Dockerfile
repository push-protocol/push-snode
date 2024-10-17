FROM node:20.9.0 as builder
COPY ./package.json ./yarn.lock ./
# RUN yarn install --immutable --production
RUN yarn install


FROM node:20.9.0 as runner

# Copy in all the dependencies we need, by avoiding
# installing them in this stage, we prevent Yarn
# from including additional cache files, which
# yields a slimmer image.
COPY                ./package.json  ./
COPY --from=builder ./node_modules/ ./node_modules/
COPY . .
EXPOSE 3001
EXPOSE 3002
EXPOSE 3003
CMD ["yarn", "start"]