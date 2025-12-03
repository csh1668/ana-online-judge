#!/bin/bash

docker compose down -v
sudo rm -rf data/*

docker compose up -d
cd web && pnpm db:push