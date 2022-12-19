
export PGPASSWORD=postgres &&

# initializing vnode
psql -h localhost -d vnode -U postgres -a -f ../vnode/migrations/V1___init.sql &&

# initializing snodes
psql -h localhost -d snode1 -U postgres -a -f ../snode/migrations/V1___init.sql &&
psql -h localhost -d snode2 -U postgres -a -f ../snode/migrations/V1___init.sql &&
psql -h localhost -d snode3 -U postgres -a -f ../snode/migrations/V1___init.sql &&
psql -h localhost -d snode4 -U postgres -a -f ../snode/migrations/V1___init.sql &&

# populating snodes

psql -h localhost -d snode1 -U postgres -a -f ../snode/migrations/V2___sampleData.sql &&
psql -h localhost -d snode2 -U postgres -a -f ../snode/migrations/V2___sampleData.sql &&
psql -h localhost -d snode3 -U postgres -a -f ../snode/migrations/V2___sampleData.sql &&
psql -h localhost -d snode4 -U postgres -a -f ../snode/migrations/V2___sampleData.sql &&

# populating vnode
psql -h localhost -d vnode1 -U postgres -a -f ../vnode/migrations/V2___sampleData.sql
