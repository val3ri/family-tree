import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from models.database import get_db, Person, PersonPhoto
from models.schemas import PersonCreate, PersonUpdate, PersonResponse, PersonPhotoResponse
from config import settings

router = APIRouter(prefix="/persons", tags=["persons"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.get("/", response_model=list[PersonResponse])
def get_persons(db: Session = Depends(get_db)):
    persons = db.query(Person).order_by(Person.last_name, Person.first_name).all()
    dirty = False
    for p in persons:
        if p.photo_url and not Path(p.photo_url.lstrip("/")).exists():
            p.photo_url = None
            dirty = True
    if dirty:
        db.commit()
    return persons


@router.get("/{person_id}", response_model=PersonResponse)
def get_person(person_id: uuid.UUID, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")
    if person.photo_url and not Path(person.photo_url.lstrip("/")).exists():
        person.photo_url = None
        db.commit()
    return person


@router.post("/", response_model=PersonResponse, status_code=201)
def create_person(data: PersonCreate, db: Session = Depends(get_db)):
    person = Person(**data.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.put("/{person_id}", response_model=PersonResponse)
def update_person(person_id: uuid.UUID, data: PersonUpdate, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: uuid.UUID, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")
    db.delete(person)
    db.commit()


@router.post("/{person_id}/photo", response_model=PersonResponse)
async def upload_photo(
    person_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Само JPEG, PNG и WebP са позволени")

    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Файлът е по-голям от {settings.MAX_UPLOAD_SIZE_MB}MB")

    uploads_path = Path(settings.UPLOADS_DIR)
    uploads_path.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower()
    filename = f"{person_id}{ext}"
    file_path = uploads_path / filename

    if person.photo_url:
        old_path = Path(person.photo_url.lstrip("/"))
        if old_path.exists():
            old_path.unlink()

    with open(file_path, "wb") as f:
        f.write(content)

    person.photo_url = f"/uploads/{filename}"
    db.commit()
    db.refresh(person)
    return person


@router.post("/{person_id}/photos", response_model=PersonPhotoResponse, status_code=201)
async def add_gallery_photo(
    person_id: uuid.UUID,
    file: UploadFile = File(...),
    caption: str = "",
    db: Session = Depends(get_db)
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Само JPEG, PNG и WebP са позволени")

    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Файлът е по-голям от {settings.MAX_UPLOAD_SIZE_MB}MB")

    uploads_path = Path(settings.UPLOADS_DIR)
    uploads_path.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower()
    filename = f"{person_id}-{uuid.uuid4()}{ext}"
    file_path = uploads_path / filename

    with open(file_path, "wb") as f:
        f.write(content)

    max_order = db.query(PersonPhoto).filter(PersonPhoto.person_id == person_id).count()
    photo = PersonPhoto(
        person_id=person_id,
        url=f"/uploads/{filename}",
        caption=caption or None,
        order=max_order,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/{person_id}/photos/{photo_id}", status_code=204)
def delete_gallery_photo(
    person_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    photo = db.query(PersonPhoto).filter(
        PersonPhoto.id == photo_id,
        PersonPhoto.person_id == person_id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Снимката не е намерена")

    photo_url = photo.url

    file_path = Path(photo_url.lstrip("/"))
    if file_path.exists():
        file_path.unlink()

    # Нулирай photo_url ако тази снимка е профилната
    person = db.query(Person).filter(Person.id == person_id).first()
    if person and person.photo_url == photo_url:
        person.photo_url = None

    db.delete(photo)
    db.commit()


@router.patch("/{person_id}/photos/{photo_id}/set-profile", response_model=PersonResponse)
def set_profile_photo(
    person_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")

    photo = db.query(PersonPhoto).filter(
        PersonPhoto.id == photo_id,
        PersonPhoto.person_id == person_id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Снимката не е намерена")

    person.photo_url = photo.url
    db.commit()
    db.refresh(person)
    return person


@router.patch("/{person_id}/photos/unset-profile", response_model=PersonResponse)
def unset_profile_photo(person_id: uuid.UUID, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Човекът не е намерен")
    person.photo_url = None
    db.commit()
    db.refresh(person)
    return person
