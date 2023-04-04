#!/usr/bin/env bash

# declare constants shared across scripts
CLIENT_CONTAINER_ID='streama-support-portal-client-1'
SERVER_CONTAINER_ID='streama-support-portal-server-1'
DATABASE_CONTAINER_ID='streama-support-portal-postgres-1'

CLIENT_IMAGE_ID='streama-support-portal-client'
SERVER_IMAGE_ID='streama-support-portal-server'
DATABASE_IMAGE_ID='postgres'

SERVER_DB_VOLUME_ID='streama-support-portal_server-db'

NETWORK_ID='streama-support-portal_default'

