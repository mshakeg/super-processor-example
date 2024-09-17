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

# Ensure DB_NAME is set
if [ -z "$DB_NAME" ]; then
    echo "Error: DB_NAME is not set in the .env file."
    exit 1
fi

# Delete the specified database
echo "Attempting to delete the '$DB_NAME' database..."

psql -U "$DB_USERNAME" -p "$DB_PORT" <<EOF
-- Terminate all active connections to the target database
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME'
  AND pid <> pg_backend_pid();

-- Drop the target database if it exists
DROP DATABASE IF EXISTS "$DB_NAME";
EOF

echo "Database '$DB_NAME' has been successfully deleted."
