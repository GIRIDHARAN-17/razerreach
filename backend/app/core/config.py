from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application configuration settings loaded from environment variables or .env file.
    """
    APP_NAME: str = "RazorReach"
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # MongoDB Atlas settings (Task 2)
    MONGODB_URI: str = ""
    DATABASE_NAME: str = "razorreach"

    # JWT Authentication settings (Task 3 & Task 4.5)
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Agent Session settings (Task 16C & 16D)
    AGENT_SESSION_TTL_HOURS: int = 24
    MAX_AGENT_STEPS_PER_TURN: int = 3
    LANGGRAPH_AGENT_ENABLED: bool = True
    LANGGRAPH_CHECKPOINT_ENABLED: bool = True


    # AI Resilience settings (Task 16G)
    AI_MAX_RETRIES: int = 2
    AI_INITIAL_BACKOFF_MS: int = 500
    AI_MAX_BACKOFF_MS: int = 2000
    AI_REQUEST_TIMEOUT_SECONDS: float = 10.0
    AI_CIRCUIT_FAILURE_THRESHOLD: int = 3
    AI_CIRCUIT_COOLDOWN_SECONDS: float = 30.0

    # Future integration placeholders (Not required to work for Task 1 & 2)
    GEMINI_API_KEY: str = ""
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    CLOUDINARY_CLOUD_NAME: str = ""

    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # Firebase Admin SDK settings (Task 3.1)
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = ""



    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret_key(cls, v: str) -> str:
        trimmed = v.strip()
        insecure_defaults = [
            "",
            "default-secret",
            "razorreach-default-jwt-secret-key-change-in-production",
            "replace-with-a-long-random-secret",
            "secret",
            "changeme",
        ]
        if not trimmed or trimmed.lower() in insecure_defaults:
            raise ValueError("Insecure or default JWT_SECRET_KEY is prohibited. Please set a secure JWT_SECRET_KEY in environment.")
        return trimmed

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


settings = Settings()
