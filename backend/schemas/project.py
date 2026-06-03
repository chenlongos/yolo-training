"""Project-related Pydantic schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    user_id: int
    name: str
    description: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
