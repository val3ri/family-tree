import io
import json
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from config import settings
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

    persons_data = [
        {col.name: serialize_db_val(getattr(p, col.name)) for col in p.__table__.columns}
        for p in persons
    ]
    relations_data = [
        {col.name: serialize_db_val(getattr(r, col.name)) for col in r.__table__.columns}
        for r in relations
    ]
    photos_data = [
        {col.name: serialize_db_val(getattr(ph, col.name)) for col in ph.__table__.columns}
        for ph in photos
    ]

    metadata = {"persons": persons_data, "relations": relations_data, "person_photos": photos_data}

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("backup.json", json.dumps(metadata, ensure_ascii=False, indent=2))
        uploads_dir = Path(settings.UPLOADS_DIR)
        if uploads_dir.exists():
            for img_path in uploads_dir.iterdir():
                if img_path.is_file():
                    zf.write(img_path, f"uploads/{img_path.name}")

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=family-tree-backup.zip"},
    )

@router.post("/import")
async def import_backup(file: UploadFile = File(...), db: Session = Depends(get_db)):
    contents = await file.read()
    filename = file.filename or ""

    if filename.endswith(".zip"):
        try:
            zip_buffer = io.BytesIO(contents)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                if "backup.json" not in zf.namelist():
                    raise HTTPException(status_code=400, detail="ZIP архивът не съдържа backup.json")
                with zf.open("backup.json") as jf:
                    data = json.load(jf)
                uploads_dir = Path(settings.UPLOADS_DIR)
                uploads_dir.mkdir(parents=True, exist_ok=True)
                for name in zf.namelist():
                    if name.startswith("uploads/") and not name.endswith("/"):
                        img_name = Path(name).name
                        with zf.open(name) as img_file:
                            (uploads_dir / img_name).write_bytes(img_file.read())
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Невалиден ZIP файл: {str(e)}")
    else:
        try:
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
