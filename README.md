
# Decentralised Message Storage Repo


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

