from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRole(str, Enum):
    CUSTOMER = "customer"
    MERCHANT = "merchant"
    ADMIN = "admin"


class UserRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="User's full name")
    email: EmailStr = Field(..., description="User's valid email address")
    password: str = Field(..., min_length=6, max_length=128, description="User password")
    role: Optional[UserRole] = Field(default=UserRole.CUSTOMER, description="User role")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Name cannot be empty or whitespace only")
        return trimmed

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("role")
    @classmethod
    def validate_public_role(cls, v: Optional[UserRole]) -> UserRole:
        if v == UserRole.ADMIN:
            raise ValueError("Public registration as admin is prohibited")
        return v or UserRole.CUSTOMER


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User password")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class FirebaseAuthRequest(BaseModel):
    id_token: str = Field(..., min_length=1, description="Firebase ID Token issued by Firebase Client SDK")
    role: Optional[UserRole] = Field(default=None, description="Requested role for new user registration (customer or merchant)")

    @field_validator("id_token")
    @classmethod
    def validate_token(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Firebase ID Token cannot be empty or whitespace")
        return trimmed

    @field_validator("role")
    @classmethod
    def validate_public_role(cls, v: Optional[UserRole]) -> Optional[UserRole]:
        if v == UserRole.ADMIN:
            raise ValueError("Public registration as admin is prohibited")
        return v



class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    is_active: bool = True
    firebase_uid: Optional[str] = None
    auth_provider: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
