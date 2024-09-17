#!/bin/bash

# Load environment variables
source .env

# Start PostgreSQL
brew services start postgresql

# Wait for PostgreSQL to start
sleep 5

# Create user, database, and set privileges
psql -U postgres -p $DB_PORT <<EOF
CREATE ROLE $DB_USERNAME WITH LOGIN PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USERNAME;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USERNAME;
EOF
