# Streama Support Portal
## Description

Support portal for Streama service

<!-- Check out the [deployed site] (<url here>) -->

## Core packages

1. Redux - State Management
2. React Router - Routing
3. Network calls - Axios

## Video uploads
<!-- video demos here -->

## Features

1. Search MovieDB for movies and shows
2. Request Movies and Shows

## Getting Started
At the root of your project duplicate the 'sample.env.*' and rename it '.env' (optionally edit any values you would like to change)

### The Easiest Way(Docker Only)
1 Start with Docker
```sh
docker-compose up
# or when rebuilding
docker-compose up --build
```

### For Faster Development
1 Run Database with Docker
```sh
docker-compose -f docker-compose-db-only.yml up
```

2 Setup + Run Server(Node) App
```sh
# from project root
cd ./server
npm install
# migrate database
npm run migrate
npm run start
```

3 Setup + Run Client(React) App
```sh
# from project root
cd ./client
npm install
npm run start
```

<!-- ## Watch the Demo -->

<!-- ## UI Feature Demos -->

<!-- ## Special Thanks -->


