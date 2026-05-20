import json
from datetime import date, datetime
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from models.database import get_db, Person, Relation, PersonPhoto, RelationType

router = APIRouter(prefix="/backup", tags=["backup"])

def serialize_db_val(val: Any) -> Any:
    if isinstance(val, (date, datetime)):
        return val.isoformat()
    if isinstance(val, UUID):
        return str(val)
    return val

@router.get("/export")
def export_backup(db: Session = Depends(get_db)):
    persons = db.query(Person).all()
    relations = db.query(Relation).all()
    photos = db.query(PersonPhoto).all()

    persons_data = []
    for p in persons:
        p_dict = {col.name: serialize_db_val(getattr(p, col.name)) for col in p.__table__.columns}
        persons_data.append(p_dict)

    relations_data = []
    for r in relations:
        r_dict = {col.name: serialize_db_val(getattr(r, col.name)) for col in r.__table__.columns}
        relations_data.append(r_dict)

    photos_data = []
    for ph in photos:
        ph_dict = {col.name: serialize_db_val(getattr(ph, col.name)) for col in ph.__table__.columns}
        photos_data.append(ph_dict)

    return {
        "persons": persons_data,
        "relations": relations_data,
        "person_photos": photos_data
    }

@router.post("/import")
async def import_backup(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        contents = await file.read()
        data = json.loads(contents.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Невалиден JSON файл: {str(e)}")

    if "persons" not in data or "relations" not in data:
        raise HTTPException(status_code=400, detail="Липсват задължителни полета ('persons' или 'relations') в архива")

    try:
        # Clear existing data in correct dependency order
        db.query(Relation).delete()
        db.query(PersonPhoto).delete()
        db.query(Person).delete()
        db.commit()

        # Import persons
        for p_data in data["persons"]:
            b_date = date.fromisoformat(p_data["birth_date"]) if p_data.get("birth_date") else None
            d_date = date.fromisoformat(p_data["death_date"]) if p_data.get("death_date") else None
            c_at = datetime.fromisoformat(p_data["created_at"]) if p_data.get("created_at") else datetime.utcnow()

            person = Person(
                id=UUID(p_data["id"]),
                first_name=p_data["first_name"],
                last_name=p_data["last_name"],
                birth_date=b_date,
                death_date=d_date,
                generation_hint=p_data.get("generation_hint"),
                bio=p_data.get("bio"),
                photo_url=p_data.get("photo_url"),
                birth_place=p_data.get("birth_place"),
                birth_time=p_data.get("birth_time"),
                death_place=p_data.get("death_place"),
                education=p_data.get("education"),
                profession=p_data.get("profession"),
                residence=p_data.get("residence"),
                created_at=c_at
            )
            db.add(person)

        # Import person photos (optional)
        for ph_data in data.get("person_photos", []):
            c_at = datetime.fromisoformat(ph_data["created_at"]) if ph_data.get("created_at") else datetime.utcnow()
            photo = PersonPhoto(
                id=UUID(ph_data["id"]),
                person_id=UUID(ph_data["person_id"]),
                url=ph_data["url"],
                caption=ph_data.get("caption"),
                order=ph_data.get("order", 0),
                created_at=c_at
            )
            db.add(photo)

        # Import relations
        for r_data in data["relations"]:
            m_date = date.fromisoformat(r_data["marriage_date"]) if r_data.get("marriage_date") else None
            c_at = datetime.fromisoformat(r_data["created_at"]) if r_data.get("created_at") else datetime.utcnow()
            
            relation = Relation(
                id=UUID(r_data["id"]),
                person_a_id=UUID(r_data["person_a_id"]),
                person_b_id=UUID(r_data["person_b_id"]),
                relation_type=RelationType(r_data["relation_type"]),
                marriage_date=m_date,
                marriage_place=r_data.get("marriage_place"),
                is_divorced=r_data.get("is_divorced", False),
                created_at=c_at
            )
            db.add(relation)

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Грешка при импортиране в базата данни: {str(e)}")

    return {"status": "success", "imported": {
        "persons": len(data["persons"]),
        "relations": len(data["relations"]),
        "person_photos": len(data.get("person_photos", []))
    }}
