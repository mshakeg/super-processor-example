#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Load environment variables from .env file
if [ -f .env ]; then
    source .env
else
    echo "Error: .env file not found."
    exit 1
fi

# Function to check if PostgreSQL is running
is_postgres_running() {
    brew services list | grep postgresql | grep started > /dev/null 2>&1
}

# Start PostgreSQL if it's not running
if ! is_postgres_running; then
    echo "Starting PostgreSQL..."
    brew services start postgresql
    # Wait for PostgreSQL to start
    sleep 5
fi

# Verify PostgreSQL is running
if ! is_postgres_running; then
    echo "Error: PostgreSQL failed to start."
    exit 1
fi

# List all PostgreSQL databases
echo "Listing all PostgreSQL databases:"
psql -U "$DB_USERNAME" -p "$DB_PORT" -c "\l"

# Alternatively, you can use a SQL query to list databases:
# psql -U "$DB_USERNAME" -p "$DB_PORT" -c "SELECT datname FROM pg_database WHERE datistemplate = false;"

# Optional: Stop PostgreSQL after listing (uncomment if desired)
# echo "Stopping PostgreSQL..."
# brew services stop postgresql
