import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db, Relation, Person
from models.schemas import RelationCreate, RelationResponse, RelationUpdate

router = APIRouter(prefix="/relations", tags=["relations"])


@router.get("/", response_model=list[RelationResponse])
def get_relations(db: Session = Depends(get_db)):
    return db.query(Relation).all()


@router.post("/", response_model=RelationResponse, status_code=201)
def create_relation(data: RelationCreate, db: Session = Depends(get_db)):
    if data.person_a_id == data.person_b_id:
        raise HTTPException(status_code=400, detail="Човек не може да е свързан сам със себе си")

    for pid in [data.person_a_id, data.person_b_id]:
        if not db.query(Person).filter(Person.id == pid).first():
            raise HTTPException(status_code=404, detail=f"Човек с id {pid} не е намерен")

    existing = db.query(Relation).filter(
        (
            (Relation.person_a_id == data.person_a_id) &
            (Relation.person_b_id == data.person_b_id)
        ) | (
            (Relation.person_a_id == data.person_b_id) &
            (Relation.person_b_id == data.person_a_id)
        ),
        Relation.relation_type == data.relation_type
    ).first()

    if existing:
        raise HTTPException(status_code=409, detail="Тази връзка вече съществува")

    relation = Relation(**data.model_dump())
    db.add(relation)
    db.commit()
    db.refresh(relation)
    return relation


@router.patch("/{relation_id}", response_model=RelationResponse)
def update_relation(relation_id: uuid.UUID, data: RelationUpdate, db: Session = Depends(get_db)):
    relation = db.query(Relation).filter(Relation.id == relation_id).first()
    if not relation:
        raise HTTPException(status_code=404, detail="Връзката не е намерена")
    relation.marriage_date = data.marriage_date
    relation.marriage_place = data.marriage_place or None
    relation.is_divorced = data.is_divorced
    db.commit()
    db.refresh(relation)
    return relation


@router.delete("/{relation_id}", status_code=204)
def delete_relation(relation_id: uuid.UUID, db: Session = Depends(get_db)):
    relation = db.query(Relation).filter(Relation.id == relation_id).first()
    if not relation:
        raise HTTPException(status_code=404, detail="Връзката не е намерена")
    db.delete(relation)
    db.commit()
