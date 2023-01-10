
# Decentralised Message Storage Repo

## Dev setup
### Code
- git clone
- Configure common library (npm link is being used to symlink common library into node_modules)

```
(cd dstorage-common && npm i)
(cd dstorage-common && npm run build) 

(cd snode && npm i)
(cd snode && npm link ../dstorage-common && ls -la node_modules | grep dstorage)

(cd vnode && npm i)
(cd vnode && npm link ../dstorage-common && ls -la node_modules | grep dstorage)
```
Note: after every npm i, please reapply npm link; after every dstorage-common chage - re-run npm build

### Database
- install psql command line tool (required for import, you can use any tool, the following steps are for MacOs only)
```
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshenv
```
- start Postgres 15
```
cd snode
docker compose up
```
- create databases snode1, vnode1 
```
psql -h localhost -U postgres -c "CREATE DATABASE \"snode1\"  WITH OWNER \"postgres\" ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';" 
psql -h localhost -U postgres -c "CREATE DATABASE \"vnode1\"  WITH OWNER \"postgres\" ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';" 
```
- create tables and import mock data
```
export PGPASSWORD=postgres
psql -h localhost -d snode1 -U postgres -a -f snode/migrations/V1__init.sql
psql -h localhost -d snode1 -U postgres -a -f snode/migrations/V2___sampleData.sql

psql -h localhost -d vnode1 -U postgres -a -f vnode/migrations/V1__init.sql
psql -h localhost -d vnode1 -U postgres -a -f vnode/migrations/V2___sampleData.sql
```
### Configuration
Check that .env files point to snode1, vnode1
```
cat snode/.env
cat vnode/.env
```
### Run nodes
```
cd snode
npm start  // npm run dev

cd vnode
npm run start   // npm run start:dev
```
## Execute tests
vnode unit tests (offline)
```
cd vnode
npm run test:e2e
```
snode and vnode: integration tests (requires database and running nodes) , snode unit tests
```
cd snode
npm test
```


## API
### snode (port 3000)
- store record in namespace 'feeds' at index '1000000' with timestamp '1661214142.000000' (august 15th) and unique key 'b120' a json value of '{"user":"Someone"}'
```
curl -X POST -H "Content-Type: application/json" --location "http://localhost:3000/api/v1/kv/ns/feeds/nsidx/1000000/ts/1661214142.000000/key/b120" -d '{"user":"Someone"}'
```
- get record from namespace 'feeds' at index '1000000' with date '20220815' and uniq key 'b120'
```
curl -X GET --location "http://localhost:3000/api/v1/kv/ns/feeds/nsidx/1000000/date/20220815/key/b120"
>
{"items":[{"ns":"feeds","skey":"b120","ts":"1661214142.000000","payload":{"user":"Someone"}}]}%            
```
- list records from namespace 'feeds' at index '1000000' with month '202208'
```
curl -X POST --location "http://localhost:3000/api/v1/kv/ns/feeds/nsidx/1000000/month/202208/list" -H "Content-Type: application/json"
>
{"items":[{"ns":"feeds","skey":"b120","ts":"1661214142.000000","payload":{"user":"Someone"}},{"ns":"feeds","skey":"b121","ts":"1661214142.000000","payload":{"user":"Someone else"}}],"lastTs":"1661214142.000000"}
```
### vnode (port 4000)
Validator fans out reads/writes to # of snodes, this is determined by readQuorum/writeQuorum. 

- store record in namespace 'feeds' at index '2000000' with timestamp '1661214142.000000' (august 15th) and unique key 'b120' a json value of '{"user":"Validator fan"}'
```
curl -X POST -H "Content-Type: application/json" --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/2000000/ts/1661214142.000000/key/b120" -d '{"user":"Validator fan"}'
```
- get record from namespace 'feeds' at index '2000000' with date '20220815' and uniq key 'b120'
```
curl -X GET --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/2000000/date/20220815/key/b120"
>
{"items":[{"ns":"feeds","skey":"b120","ts":"1661214142.000000","payload":{"user":"Validator fan"}}],"result":{"itemCount":1,"keysWithoutQuorumCount":0,"keysWithoutQuorum":[],"quorumResult":"QUORUM_OK","lastTs":"1661214142.000000"}}% 
```
- list records from namespace 'feeds' at index '2000000' with month '202208'
```
curl -X POST --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/2000000/month/202208/list" -H "Content-Type: application/json"                                          
>
{"items":[{"ns":"feeds","skey":"v33","ts":"1661214142.000000","payload":{"user":"Validator fan v2"}},{"ns":"feeds","skey":"b120","ts":"1661214142.000000","payload":{"user":"Validator fan"}}],"result":{"itemCount":2,"keysWithoutQuorumCount":0,"keysWithoutQuorum":[],"quorumResult":"QUORUM_OK","lastTs":"1661214142.000000"}}
```
- list records from namespace 'feeds' at index '2000000' with month '202208' starting from (>) timestamp '1661214142.000000'
```
curl -X POST --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/2000000/month/202208/list?firstTs=1661214142.000000" -H "Content-Type: application/json"                                          
>
{"items":[{"ns":"feeds","skey":"v33","ts":"1661214202.000000","payload":{"user":"Validator fan v2"}}],"result":{"itemCount":1,"keysWithoutQuorumCount":0,"keysWithoutQuorum":[],"quorumResult":"QUORUM_OK","lastTs":"1661214202.000000"}}
```

## Run Locally using Docker

- Clone the project

```bash
  git clone https://github.com/ethereum-push-notification-service/epns-dstorage
```

- Go to the project directory

```bash
  cd epns-dstorage
```

### Generate Docker images for storage-node and validator-node
In the root folder run the following commands
```bash 
docker build -t snodeimage -f snode/Dockerfile . 
```
```bash
docker build -t vnodeimage -f vnode/Dockerfile . 
```
### Running the Docker containers
```bash
cd docker
docker compose up
```
### Populating the postgres instance
Run this command in another terminal after docker compose has started completely
```
sh dstorage_populate.sh
```


## Running Tests

To run tests, open Docker terminal for each snode container and run the command

```bash
  npm test
```

