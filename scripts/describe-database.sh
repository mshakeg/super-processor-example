#!/bin/bash

# Load environment variables
source .env

# Get the size of the database
psql -U $DB_USERNAME -p $DB_PORT -d $DB_NAME -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME')) AS size;"
