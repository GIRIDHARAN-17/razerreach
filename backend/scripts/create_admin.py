"""
RazorReach Admin Bootstrap Script (Development / Maintenance Tool)

This script allows platform administrators to safely create the initial admin user
or add additional admin accounts directly in the database.

Usage:
    python -m scripts.create_admin --name "Admin User" --email "admin@example.com" --password "supersecretpass"

Options:
    --name      Full name of the admin user (optional, default: "System Admin")
    --email     Admin email address (required)
    --password  Admin password (minimum 6 characters, required)
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to Python path if run directly
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.database import db_manager
from app.core.security import hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("razorreach.create_admin")


async def create_admin_user(name: str, email: str, password: str) -> bool:
    """
    Connect to MongoDB, validate parameters, and safely insert an admin user.
    """
    normalized_email = email.strip().lower()
    if not normalized_email or "@" not in normalized_email:
        logger.error("Invalid email address format provided.")
        return False

    if not password or len(password) < 6:
        logger.error("Password must be at least 6 characters long.")
        return False

    logger.info(f"Connecting to database: '{settings.DATABASE_NAME}'...")
    await db_manager.connect()

    db = db_manager.get_db()
    if db is None:
        logger.error("Failed to connect to database. Please check your MONGODB_URI setting in .env.")
        return False

    try:
        existing_user = await db.users.find_one({"email": normalized_email})
        if existing_user:
            logger.error(f"User with email '{normalized_email}' already exists in database. Aborting.")
            return False

        now = datetime.now(timezone.utc).isoformat()
        admin_doc = {
            "name": name.strip() or "System Admin",
            "email": normalized_email,
            "password_hash": hash_password(password),
            "role": "admin",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        result = await db.users.insert_one(admin_doc)
        logger.info(f"SUCCESS: Admin user created successfully.")
        logger.info(f"Admin Email: {normalized_email}")
        logger.info(f"Inserted Document ID: {result.inserted_id}")
        return True
    except Exception as e:
        logger.error(f"Error creating admin user: {type(e).__name__}")
        return False
    finally:
        await db_manager.disconnect()


def main():
    parser = argparse.ArgumentParser(description="Create a new RazorReach Admin user.")
    parser.add_argument("--name", type=str, default="System Admin", help="Full name of admin user")
    parser.add_argument("--email", type=str, required=True, help="Admin email address")
    parser.add_argument("--password", type=str, required=True, help="Admin password (min 6 characters)")

    args = parser.parse_args()

    success = asyncio.run(create_admin_user(name=args.name, email=args.email, password=args.password))
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
