# OR project

## Requirements

Python Version: **3.12**

PostgreSQL Version: **16.6**

## Migrating datasets to PostgreSQL
1. Create a file named **.env** inside parent directory with the following information. (This is a sample. Modify corresponding variables if required.)
  ```
  DB_NAME=testdb
  DB_USER=postgres
  DB_PASSWORD=1234
  DB_HOST=localhost
  DB_PORT=5432
  ```

2. Run migrate_datasets.py
  ```sh
    python migrate_datasets.py
  ```

3. Check if migration is a success using check_migration.py. If the output is not empty, then the migration has succeeded, or else it has failed.
  ```sh
    python check_migration.py
  ```

4. (Optional) You can remove data files from the parent directory at the end.

## Usage

1. Clone repository.
  ```sh
    git clone https://github.com/dkvc/AutumSem_OR
  ```

2. Run app.py
  ```sh
    python app.py
  ```
3. You can find your website running on http://127.0.0.1:5000 or http://localhost:5000.
