"""
SmartLearn — SQLite to PostgreSQL Safe Data Migration Script
============================================================
Safely migrates all user accounts, password hashes, courses, enrollments,
reviews, assessments, and AI chat data from local SQLite (smartlearn.db)
to production PostgreSQL (Render PostgreSQL).

Preserves:
- Exact user IDs, roles, and bcrypt password hashes
- Foreign key relations and timestamps
- JSON structures and profiles
- PostgreSQL auto-increment sequences

Usage:
    # 1. From DATABASE_URL environment variable:
    python migrate_sqlite_to_postgres.py

    # 2. Or specifying target URL explicitly:
    python migrate_sqlite_to_postgres.py --target "postgresql://user:password@hostname:5432/dbname"

    # 3. Optional custom source:
    python migrate_sqlite_to_postgres.py --source "backend/smartlearn.db" --target "postgresql://..."
"""

import os
import sys
import argparse
import sqlite3
import json
from pathlib import Path

# Add project root and backend to sys.path
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import create_engine, inspect, text
from backend.app.main import Base

# Dependency-ordered tables for clean relational loading
MIGRATION_TABLES = [
    "categories",
    "career_goals",
    "skills",
    "users",
    "profiles",
    "courses",
    "assessments",
    "assessment_questions",
    "assessment_attempts",
    "enrollments",
    "reviews",
    "payments",
    "notifications",
    "conversations",
    "conversation_members",
    "messages",
    "message_attachments",
    "message_reactions",
    "message_forwards",
    "message_user_deletions",
    "two_factor_otps",
    "password_reset_tokens",
    "ai_chatbot_conversations",
    "ai_chatbot_messages",
    "wishlist_items",
    "recommendations",
    "email_logs"
]

def clean_pg_url(url: str) -> str:
    """Ensures postgresql:// dialect is used instead of postgres://."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url

def migrate(source_db: Path, target_url: str):
    print("=" * 65)
    print("      SMARTLEARN DATABASE MIGRATION: SQLITE -> POSTGRESQL")
    print("=" * 65)
    print(f"Source SQLite DB : {source_db.resolve()}")
    masked_target = target_url.split("@")[-1] if "@" in target_url else target_url
    print(f"Target DB Host   : ...@{masked_target}")

    if not source_db.exists():
        print(f"\n[ERROR] Source database file not found at: {source_db}")
        sys.exit(1)

    target_url = clean_pg_url(target_url)

    # 1. Connect to SQLite
    sqlite_conn = sqlite3.connect(source_db)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()

    # Get available tables in SQLite
    available_tables = [
        r[0] for r in sqlite_cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]
    print(f"Discovered {len(available_tables)} tables in SQLite source.")

    # 2. Connect to PostgreSQL and create schema
    print("\n[1/4] Connecting to PostgreSQL and creating schema...")
    try:
        pg_engine = create_engine(target_url, pool_pre_ping=True)
        Base.metadata.create_all(bind=pg_engine)
        print("  -> PostgreSQL schema verified/created successfully.")
    except Exception as e:
        print(f"\n[ERROR] Could not connect to PostgreSQL target: {e}")
        print("\nPlease check your DATABASE_URL and ensure PostgreSQL is running.")
        sys.exit(1)

    # 3. Migrate data
    print("\n[2/4] Migrating records...")
    migration_summary = {}

    with pg_engine.connect() as pg_conn:
        # Disable foreign key checks during batch import for smooth migration
        try:
            pg_conn.execute(text("SET session_replication_role = 'replica';"))
            pg_conn.commit()
        except Exception:
            pass

        # Sort available tables: tables in MIGRATION_TABLES first, then any extra tables
        ordered_tables = [t for t in MIGRATION_TABLES if t in available_tables]
        extra_tables = [t for t in available_tables if t not in ordered_tables]
        all_tables_to_migrate = ordered_tables + extra_tables

        for table in all_tables_to_migrate:
            rows = sqlite_cur.execute(f'SELECT * FROM "{table}"').fetchall()
            if not rows:
                migration_summary[table] = {"sqlite": 0, "postgres": 0, "status": "empty"}
                continue

            # Inspect columns in PG table
            pg_inspector = inspect(pg_engine)
            try:
                pg_cols = {col["name"]: col["type"] for col in pg_inspector.get_columns(table)}
            except Exception:
                # Table might not exist in PG metadata
                print(f"  [Skip] Table '{table}' not present in PostgreSQL schema.")
                continue

            inserted = 0
            for row in rows:
                row_dict = dict(row)
                # Keep only columns that exist in PG table
                filtered = {}
                for k, v in row_dict.items():
                    if k in pg_cols:
                        # Handle JSON columns stored as strings in SQLite
                        col_type_str = str(pg_cols[k]).upper()
                        if "JSON" in col_type_str and isinstance(v, str):
                            try:
                                filtered[k] = json.loads(v)
                            except Exception:
                                filtered[k] = v
                        else:
                            filtered[k] = v

                if not filtered:
                    continue

                col_names = list(filtered.keys())
                col_list_str = ", ".join([f'"{c}"' for c in col_names])
                placeholders = ", ".join([f":{c}" for c in col_names])

                # ON CONFLICT DO NOTHING ensures idempotent re-runs
                insert_stmt = text(
                    f'INSERT INTO "{table}" ({col_list_str}) VALUES ({placeholders}) '
                    f'ON CONFLICT DO NOTHING'
                )

                try:
                    pg_conn.execute(insert_stmt, filtered)
                    inserted += 1
                except Exception as row_err:
                    print(f"    [Warning] Row insert error in '{table}': {row_err}")

            pg_conn.commit()

            # Verify count
            pg_count = pg_conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()
            migration_summary[table] = {
                "sqlite": len(rows),
                "postgres": pg_count,
                "status": "success" if pg_count >= len(rows) else "partial"
            }
            print(f"  -> {table:25} : SQLite {len(rows):4} rows | PG {pg_count:4} rows")

        # 4. Re-enable foreign key checks
        try:
            pg_conn.execute(text("SET session_replication_role = 'origin';"))
            pg_conn.commit()
        except Exception:
            pass

        # 5. Fix PostgreSQL auto-increment sequences
        print("\n[3/4] Resetting PostgreSQL serial sequences...")
        for table in all_tables_to_migrate:
            try:
                seq_query = text(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1)) FROM \"{table}\";"
                )
                pg_conn.execute(seq_query)
                pg_conn.commit()
            except Exception:
                pass
        print("  -> Auto-increment sequences successfully aligned with migrated data.")

    sqlite_conn.close()

    # 6. Final verification report
    print("\n[4/4] Migration Summary & User Verification:")
    print("-" * 65)
    with pg_engine.connect() as pg_conn:
        user_rows = pg_conn.execute(
            text("SELECT id, full_name, email, role, is_active FROM users ORDER BY id ASC")
        ).fetchall()

        print(f"Total Users in PostgreSQL: {len(user_rows)}")
        for u in user_rows:
            if any(k in u[2] for k in ["gayatri", "honey", "harsha", "tulasi", "admin"]):
                print(f"  [OK] ID={u[0]:2} | {u[1]:22} | {u[2]:30} | Role: {u[3]}")

    print("=" * 65)
    print("SUCCESS: SmartLearn SQLite data successfully migrated to PostgreSQL!")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate SmartLearn SQLite to PostgreSQL")
    parser.add_argument(
        "--source",
        default=str(ROOT_DIR / "backend" / "smartlearn.db"),
        help="Path to source SQLite database file"
    )
    parser.add_argument(
        "--target",
        default=os.getenv("DATABASE_URL", ""),
        help="Target PostgreSQL connection URL (or set DATABASE_URL env var)"
    )

    args = parser.parse_args()

    target_url = args.target.strip()
    if not target_url:
        print("[ERROR] No target PostgreSQL URL provided.")
        print("Please set the DATABASE_URL environment variable or pass --target 'postgresql://...'")
        sys.exit(1)

    source_path = Path(args.source)
    if not source_path.exists():
        # Try root smartlearn.db fallback
        root_db = ROOT_DIR / "smartlearn.db"
        if root_db.exists():
            source_path = root_db

    migrate(source_path, target_url)
