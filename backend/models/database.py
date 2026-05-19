import uuid
import enum
from datetime import date, datetime
from sqlalchemy import (
    create_engine, Column, String, Text, Date, DateTime,
    Enum, ForeignKey, Integer, event
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RelationType(str, enum.Enum):
    PARENT_CHILD = "PARENT_CHILD"
    SPOUSE = "SPOUSE"
    SIBLING = "SIBLING"


class Person(Base):
    __tablename__ = "persons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    birth_date = Column(Date, nullable=True)
    death_date = Column(Date, nullable=True)
    generation_hint = Column(Integer, nullable=True)
    bio = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    photos = relationship(
        "PersonPhoto",
        back_populates="person",
        cascade="all, delete-orphan",
        order_by="PersonPhoto.order"
    )

    relations_as_a = relationship(
        "Relation",
        foreign_keys="Relation.person_a_id",
        back_populates="person_a",
        cascade="all, delete-orphan"
    )
    relations_as_b = relationship(
        "Relation",
        foreign_keys="Relation.person_b_id",
        back_populates="person_b",
        cascade="all, delete-orphan"
    )


class PersonPhoto(Base):
    __tablename__ = "person_photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("persons.id"), nullable=False)
    url = Column(String(500), nullable=False)
    caption = Column(String(200), nullable=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", back_populates="photos")


class Relation(Base):
    __tablename__ = "relations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_a_id = Column(UUID(as_uuid=True), ForeignKey("persons.id"), nullable=False)
    person_b_id = Column(UUID(as_uuid=True), ForeignKey("persons.id"), nullable=False)
    relation_type = Column(Enum(RelationType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    person_a = relationship("Person", foreign_keys=[person_a_id], back_populates="relations_as_a")
    person_b = relationship("Person", foreign_keys=[person_b_id], back_populates="relations_as_b")
