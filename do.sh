#bin/sh
COMMAND=""

COLOUR_BLUE="\e[0;34m"
COLOUR_GREEN="\e[0;32m"
COLOUR_NORMAL="\e[0;0m"
COLOUR_RED="\e[0;31m"
COLOUR_YELLOW="\e[0;33m"
GREEN="\033[1;32m"
NOCOLOR="\033[0m"


print() {
  echo "$GREEN $1 $NOCOLOR"
}

# Example command
command_test() {
  # Parse the command specific arguments as you usuaully would
  # Using "$1" etc.
  print "$1 $2 $3"
}

command_deploy_all_contracts() {
  # DEPLOY START
nvm use 18

export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0  

npx hardhat clean

npx hardhat compile

npx hardhat --network localhost v:deployTestPushTokenCt

export PUSH_CT=0x5FbDB2315678afecb367f032d93F642f64180aa3 
npx hardhat --network localhost v:deployValidatorCt $PUSH_CT

export VAL_CT=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
npx hardhat --network localhost v:deployStorageCt $VAL_CT
}


command_deploy_all_nodes() {
export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
export PUSH_CT=0x5FbDB2315678afecb367f032d93F642f64180aa3 
export VAL_CT=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
export STORAGE_CT=0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6 
nvm use 18

#v1
npx hardhat --network localhost v:registerValidator --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT 8e12de12c35eabf35b56b04e53c4e468e46727e8 "http://localhost:4001" 101
#v2
npx hardhat --network localhost v:registerValidator --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT fdaeaf7afcfbb4e4d16dc66bd2039fd6004cfce8 "http://localhost:4002" 102
#v3
npx hardhat --network localhost v:registerValidator --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT 98f9d910aef9b3b9a45137af1ca7675ed90a5355 "http://localhost:4003" 103

#d1
npx hardhat --network localhost v:registerDelivery --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT 816adec240b4744a1e1e112d0411cafb8f256183 200
#s1
npx hardhat --network localhost v:registerStorage --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT 3563C89b05e4dcD0edEeE0F3e93e396C128C06E2 "http://localhost:3001" 250
#s2
npx hardhat --network localhost v:registerStorage --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT b4d6fd1c0df9e3f427a1a8f8a8ec122396206ff7 "http://localhost:3002" 260 

# # check what has been registered
npx hardhat --network localhost v:listNodes --validator-proxy-ct $VAL_CT
}
listening() {
    if [ $# -eq 0 ]; then
        sudo lsof -iTCP -sTCP:LISTEN -n -P
    elif [ $# -eq 1 ]; then
        sudo lsof -iTCP -sTCP:LISTEN -n -P | grep -i --color $1
    else
        print "Usage: listening [pattern]"
    fi
}

#
# Handle command execution
#
main() {
  CURRENT_DIR=$(pwd)
  print "Running [$COMMAND] in [$CURRENT_DIR]"
  set -x #echo on
  case "$COMMAND" in

  "hh.node")
    export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
    npx hardhat node
    ;;

  "hh.deploy_all_contracts")
    export VAL_CT=0x0
    command_deploy_all_contracts  "$@"
    ;;

  "hh.deploy_all_nodes")
    export VAL_CT=0x0
    command_deploy_all_nodes  "$@"
    ;;

  "debug.v1")
    CONFIG_DIR=docker/01
    echo  > ${CONFIG_DIR}/log/debug.log
    echo  > ${CONFIG_DIR}/log/error.log
    CONFIG_DIR=${CONFIG_DIR} LOG_DIR=${CONFIG_DIR}/log yarn run dev9001
    ;;
  "debug.v2")
    CONFIG_DIR=docker/02
    echo  > ${CONFIG_DIR}/log/debug.log
    echo  > ${CONFIG_DIR}/log/error.log
    CONFIG_DIR=${CONFIG_DIR} LOG_DIR=${CONFIG_DIR}/log yarn run dev9002
    ;;
  "debug.v3")
    CONFIG_DIR=docker/03
    echo  > ${CONFIG_DIR}/log/debug.log
    echo  > ${CONFIG_DIR}/log/error.log
    CONFIG_DIR=${CONFIG_DIR} LOG_DIR=${CONFIG_DIR}/log yarn run dev9003
    ;;

  "debug.s1")
    CONFIG_DIR=docker/01
    echo  > ${CONFIG_DIR}/log/debug.log
    echo  > ${CONFIG_DIR}/log/error.log
    CONFIG_DIR=${CONFIG_DIR} LOG_DIR=${CONFIG_DIR}/log yarn run dev6001
    ;;
  "debug.s2")
    CONFIG_DIR=docker/02
    echo  > ${CONFIG_DIR}/log/debug.log
    echo  > ${CONFIG_DIR}/log/error.log
    CONFIG_DIR=${CONFIG_DIR} LOG_DIR=${CONFIG_DIR}/log yarn run dev6002
    ;;
  "debug.d1")
    CONFIG_DIR=docker/d01
    echo  > ${CONFIG_DIR}/log/debug.log
    echo  > ${CONFIG_DIR}/log/error.log
    CONFIG_DIR=${CONFIG_DIR} LOG_DIR=${CONFIG_DIR}/log yarn run dev7001
    ;;

  "hh.cleanCompile")
    export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
    npx hardhat clean
    npx hardhat compile
    ;;



  "hh.storageTests")
    export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
    npx hardhat test --grep StorageTestAutoRf
    npx hardhat test --grep StorageTestNoAutoRf
    npx hardhat test --grep StorageTestBig
    ;;  

  "hh.testBasic")
    export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
    npx hardhat test --grep test_5to6
    ;;  
  "hardhat.test.ReportNode")
    export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
    npx hardhat test --grep ReportNode
    ;;
  "hardhat.clean")
    export PRIVATE_KEY=e4b7329d3d0f6123de7cd053f3e1505c05e1a303f7c0ebff6526f574bf06afd0
    npx hardhat clean
    npx hardhat typechain
    ;;
  "test")
    command_test "$@"
    ;;
  "mysql.start")
    docker compose start mysql
    ;;
  "mysql.stop")
    docker compose stop mysql
    ;;
  "docker.kill")
    pkill -f "/Applications/Docker.app"
    ;;
  "docker.clean")
    rm -rf /Users/igx/Documents/projects/push-storage-node/external
    ;;

  "run_dev")
    yarn run dev2
    ;;
  "run_test")
    yarn run test
    ;;



  "log.err")
    tail -n 100 logs/app.log | grep -i --color ERROR
    ;;
  "log.debug")
    tail -n 30 logs/app.log
  ;;
  "listening")
    listening "$@"
    ;;


  "macchanger.random")
    OLD_MAC=$(ifconfig en0 | grep ether | awk '{print $2}')
    NEW_MAC=$(openssl rand -hex 6 | sed 's/\(..\)/\1:/g; s/.$//')
    print "mac=$OLD_MAC, new mac=$NEW_MAC"
    print "changing mac"
    macchanger -m "$NEW_MAC" en0
    UPDATED_MAC=$(ifconfig en0 | grep ether | awk '{print $2}')
    print "mac=$UPDATED_MAC"
    print "pinging internet"
    ping -c 3 8.8.8.8 2>&1
    ;;


  *)
    print "Error: Command not supported.. ($COMMAND)"
    exit 1
    ;;

  esac
  exit 0
}

# Parse the global options.
# http://mywiki.wooledge.org/BashFAQ/035
while :; do
  case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
  --db_port)
    DB_PORT=$2
    shift 2
    ;;
  --) # End of all options
    shift
    break
    ;;
  -*)
    print "WARN: Unknown option (ignored): $1" >&2
    shift
    ;;
  *) # no more options. Stop while loop
    break
    ;;
  esac
done

COMMAND="$1"
shift
main "$@"
