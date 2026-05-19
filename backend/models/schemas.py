from uuid import UUID
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from models.database import RelationType


class PersonBase(BaseModel):
    first_name: str
    last_name: str
    birth_date: Optional[date] = None
    death_date: Optional[date] = None
    generation_hint: Optional[int] = None
    bio: Optional[str] = None


class PersonCreate(PersonBase):
    pass


class PersonUpdate(PersonBase):
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class PersonPhotoResponse(BaseModel):
    id: UUID
    url: str
    caption: Optional[str] = None
    order: int

    class Config:
        from_attributes = True


class PersonResponse(PersonBase):
    id: UUID
    photo_url: Optional[str] = None
    photos: list[PersonPhotoResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


class RelationBase(BaseModel):
    person_a_id: UUID
    person_b_id: UUID
    relation_type: RelationType


class RelationCreate(RelationBase):
    pass


class RelationResponse(RelationBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class GraphNode(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    birth_date: Optional[date] = None
    death_date: Optional[date] = None
    generation_hint: Optional[int] = None
    photo_url: Optional[str] = None


class GraphEdge(BaseModel):
    id: UUID
    person_a_id: UUID
    person_b_id: UUID
    relation_type: RelationType


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
