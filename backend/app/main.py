import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import db_manager
from app.routers import admin, ai, analytics, auth, cart, health, history, merchants, payments, products, search, webhooks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("razorreach")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager for managing async application resources.
    Establishes MongoDB connection on startup and initializes Firebase Admin SDK.
    """
    logger.info(f"Starting {settings.APP_NAME} backend in [{settings.ENVIRONMENT}] environment.")
    await db_manager.connect()
    try:
        from app.integrations.firebase import initialize_firebase
        initialize_firebase()
    except Exception as fb_err:
        logger.warning(f"Startup Firebase Admin SDK initialization error: {fb_err}")
    yield
    logger.info(f"Shutting down {settings.APP_NAME} backend.")
    await db_manager.disconnect()


app = FastAPI(
    title=settings.APP_NAME,
    description="RazorReach Backend API — AI-Powered Commerce Platform for Razorpay Buildathon",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")   
async def root():
    return {"message": "Welcome to the RazorReach Backend API"}

# Health check endpoints mounted at root /health and /api/health for cloud deployment
app.include_router(health.router)
app.include_router(health.router, prefix="/api")

app.include_router(auth.router, prefix="/api")
app.include_router(merchants.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")



