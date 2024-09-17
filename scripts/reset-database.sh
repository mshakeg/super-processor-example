#!/bin/bash

# Load environment variables
source .env

# Stop PostgreSQL if it's running
brew services stop postgresql

# Wait for PostgreSQL to stop
sleep 5

# Start PostgreSQL
brew services start postgresql

# Wait for PostgreSQL to start
sleep 5

# Connect to PostgreSQL and run SQL commands
psql -U postgres -p $DB_PORT <<EOF
DROP DATABASE IF EXISTS $DB_NAME; -- Drop existing database if it exists
DROP ROLE IF EXISTS $DB_USERNAME; -- Drop existing role if it exists
CREATE ROLE $DB_USERNAME WITH LOGIN PASSWORD '$DB_PASSWORD'; -- Create new role
CREATE DATABASE $DB_NAME OWNER $DB_USERNAME; -- Create new database
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USERNAME; -- Grant privileges
EOF
