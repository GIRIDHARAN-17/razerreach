import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings

logger = logging.getLogger("razorreach.database")


class Database:
    """
    Centralized MongoDB Atlas connection manager using Motor (async MongoDB driver).
    """

    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self) -> None:
        """Initialize AsyncIOMotorClient connection on app startup."""
        if not settings.MONGODB_URI:
            logger.warning("MONGODB_URI is not set in environment settings.")
            return

        try:
            logger.info(f"Initializing MongoDB client for database: '{settings.DATABASE_NAME}'")
            self.client = AsyncIOMotorClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=5000,
            )
            self.db = self.client[settings.DATABASE_NAME]
            # Perform connection ping verification
            await self.client.admin.command("ping")
            logger.info("Successfully connected to MongoDB Atlas.")
            await self.init_indexes()
        except Exception as e:
            logger.error(f"Failed to establish MongoDB connection: {type(e).__name__}")
            # Keep client reference if created, but mark db connection check as unverified
            self.db = None

    async def init_indexes(self) -> None:
        """Create required database indexes for users, merchants, products, and search."""
        if self.db is not None:
            try:
                # Task 3: Unique index on users.email
                await self.db.users.create_index("email", unique=True)
                # Task 3.1: Sparse unique index on users.firebase_uid
                await self.db.users.create_index("firebase_uid", unique=True, sparse=True)
                # Task 4: Unique index on merchants.user_id
                await self.db.merchants.create_index("user_id", unique=True)

                # Task 4: Index on merchants.status for filtering
                await self.db.merchants.create_index("status")
                # Task 5: Product indexes
                await self.db.products.create_index("merchant_id")
                await self.db.products.create_index("status")
                await self.db.products.create_index("category")
                await self.db.products.create_index("price")
                await self.db.products.create_index([("merchant_id", 1), ("status", 1)])
                # Task 6: Text index on search_text for keyword search
                await self.db.products.create_index([("search_text", "text")])
                # Task 9: Cart indexes
                await self.db.carts.create_index([("user_id", 1), ("status", 1)])
                # Task 10: Order & Payment indexes
                await self.db.orders.create_index("user_id")
                await self.db.orders.create_index("razorpay_order_id", unique=True, sparse=True)
                await self.db.payments.create_index("order_id")
                await self.db.payments.create_index(
                    [("razorpay_payment_id", 1)],
                    unique=True,
                    partialFilterExpression={"razorpay_payment_id": {"$type": "string"}},
                )
                await self.db.processed_webhooks.create_index("event_id", unique=True, sparse=True)
                # Task 11: Analytics events indexes
                await self.db.analytics_events.create_index("event_type")
                await self.db.analytics_events.create_index("created_at")
                await self.db.analytics_events.create_index("merchant_id")
                await self.db.analytics_events.create_index("product_id")
                await self.db.analytics_events.create_index("user_id")
                # Task 12: Revenue Opportunities indexes
                await self.db.revenue_opportunities.create_index("merchant_id")
                await self.db.revenue_opportunities.create_index("type")
                await self.db.revenue_opportunities.create_index("priority")
                await self.db.revenue_opportunities.create_index("generated_at")
                await self.db.revenue_opportunities.create_index(
                    [("merchant_id", 1), ("type", 1), ("target", 1), ("period_start", 1)],
                    unique=True,
                    sparse=True,
                )
                # Task 14: Audit logs indexes
                await self.db.audit_logs.create_index("actor_id")
                await self.db.audit_logs.create_index("action")
                await self.db.audit_logs.create_index("resource_type")
                await self.db.audit_logs.create_index("resource_id")
                await self.db.audit_logs.create_index("created_at")
                await self.db.audit_logs.create_index([("actor_id", 1), ("created_at", -1)])
                logger.info("MongoDB indexes verified successfully.")




            except Exception as e:
                logger.warning(f"Index initialization warning: {type(e).__name__}")

    async def disconnect(self) -> None:
        """Close MongoDB connection gracefully on app shutdown."""
        if self.client:
            logger.info("Closing MongoDB client connection.")
            self.client.close()
            self.client = None
            self.db = None

    def get_db(self) -> Optional[AsyncIOMotorDatabase]:
        """
        Get database instance.
        Auto-initializes client and db from settings if needed.
        """
        if self.db is None:
            if self.client is None and settings.MONGODB_URI:
                try:
                    logger.info(f"Auto-initializing MongoDB client for database: '{settings.DATABASE_NAME}'")
                    self.client = AsyncIOMotorClient(
                        settings.MONGODB_URI,
                        serverSelectionTimeoutMS=5000,
                    )
                except Exception as e:
                    logger.error(f"Failed to auto-create MongoDB client in get_db: {type(e).__name__}")
            if self.client is not None and settings.DATABASE_NAME:
                self.db = self.client[settings.DATABASE_NAME]
        return self.db

    async def ping(self) -> bool:
        """
        Ping MongoDB to verify connection status.
        Never leaks connection string or credentials on error.
        """
        if not self.client:
            return False
        try:
            await self.client.admin.command("ping")
            return True
        except Exception as e:
            logger.warning(f"MongoDB ping failed: {type(e).__name__}")
            return False


db_manager = Database()
