
# export PGPASSWORD=postgres 

# # initializing vnode
# psql -h db -d vnode1 -U postgres -a -f ../vnode/migrations/V1__init.sql 

# # initializing snodes
# psql -h db -d snode1 -U postgres -a -f ../snode/migrations/V1__init.sql 
# psql -h db -d snode2 -U postgres -a -f ../snode/migrations/V1__init.sql 
# psql -h db -d snode3 -U postgres -a -f ../snode/migrations/V1__init.sql 
# psql -h db -d snode4 -U postgres -a -f ../snode/migrations/V1__init.sql 

# # populating snodes

# psql -h db -d snode1 -U postgres -a -f ../snode/migrations/V2___sampleData.sql 
# psql -h db -d snode2 -U postgres -a -f ../snode/migrations/V2___sampleData.sql 
# psql -h db -d snode3 -U postgres -a -f ../snode/migrations/V2___sampleData.sql 
# psql -h db -d snode4 -U postgres -a -f ../snode/migrations/V2___sampleData.sql 

# #populating vnode
# psql -h db -d vnode1 -U postgres -a -f /vnode/migrations/V2___sampleData.sql



export PGPASSWORD=postgres 

# initializing vnode
psql -h db -d vnode1 -U postgres -a -f /vnode/migrations/V1__init.sql 

# initializing snodes
psql -h db -d snode1 -U postgres -a -f /snode/migrations/V1__init.sql 
psql -h db -d snode2 -U postgres -a -f /snode/migrations/V1__init.sql 
psql -h db -d snode3 -U postgres -a -f /snode/migrations/V1__init.sql 
psql -h db -d snode4 -U postgres -a -f /snode/migrations/V1__init.sql 

# populating snodes

psql -h db -d snode1 -U postgres -a -f /snode/migrations/V2___sampleData.sql 
psql -h db -d snode2 -U postgres -a -f /snode/migrations/V2___sampleData.sql 
psql -h db -d snode3 -U postgres -a -f /snode/migrations/V2___sampleData.sql 
psql -h db -d snode4 -U postgres -a -f /snode/migrations/V2___sampleData.sql 

#populating vnode
psql -h db -d vnode1 -U postgres -a -f /vnode/migrations/V2___sampleData.sql


