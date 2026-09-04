import asyncio
import sys
import os
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings
from app.core.database import db_manager
from app.core.security import hash_password

async def create_admin_account():
    print(f"Connecting to MongoDB Atlas database: '{settings.DATABASE_NAME}'...")
    await db_manager.connect()
    db = db_manager.get_db()
    
    if db is None:
        print("Error: Could not connect to database.")
        return

    email = "admin1@gmail.com"
    password = "admin1"
    hashed = hash_password(password)
    now_iso = datetime.now(timezone.utc).isoformat()

    user_doc = {
        "name": "Admin One",
        "email": email,
        "password_hash": hashed,
        "role": "admin",
        "is_active": True,
        "updated_at": now_iso,
    }

    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one({"_id": existing["_id"]}, {"$set": user_doc})
        print(f"Successfully updated existing user '{email}' to role 'admin' with updated password.")
    else:
        user_doc["created_at"] = now_iso
        res = await db.users.insert_one(user_doc)
        print(f"Successfully created new admin user '{email}' with ID: {res.inserted_id}")

    await db_manager.disconnect()

if __name__ == "__main__":
    asyncio.run(create_admin_account())
