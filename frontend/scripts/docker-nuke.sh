#!/usr/bin/env bash

docker-compose down 
docker-compose down --volumes
docker volume prune
docker network prune
docker container stop $(docker container ls -a -q)
docker container rm $(docker container ls -a -q)
docker image rm $(docker image ls -a -q)