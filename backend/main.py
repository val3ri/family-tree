from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy import inspect, text
from models.database import Base, engine
from routes import persons, relations, graph
from config import settings

Base.metadata.create_all(bind=engine)

def run_migrations():
    inspector = inspect(engine)
    if inspector.has_table("persons"):
        columns = {col['name'] for col in inspector.get_columns('persons')}
        new_cols = {
            "birth_place": "VARCHAR(200)",
            "birth_time": "VARCHAR(100)",
            "death_place": "VARCHAR(200)",
            "education": "VARCHAR(500)",
            "profession": "VARCHAR(500)",
            "residence": "VARCHAR(500)"
        }
        with engine.begin() as conn:
            for col_name, col_type in new_cols.items():
                if col_name not in columns:
                    conn.execute(text(f"ALTER TABLE persons ADD COLUMN {col_name} {col_type}"))
                    print(f"Migrated: Added column {col_name} to persons table")

    if inspector.has_table("relations"):
        rel_columns = {col['name'] for col in inspector.get_columns('relations')}
        new_rel_cols = {
            "marriage_date": "DATE",
            "marriage_place": "VARCHAR(200)",
            "is_divorced": "BOOLEAN NOT NULL DEFAULT FALSE",
        }
        with engine.begin() as conn:
            for col_name, col_type in new_rel_cols.items():
                if col_name not in rel_columns:
                    conn.execute(text(f"ALTER TABLE relations ADD COLUMN {col_name} {col_type}"))
                    print(f"Migrated: Added column {col_name} to relations table")

run_migrations()

app = FastAPI(title="Family Tree API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_path = Path(settings.UPLOADS_DIR)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

app.include_router(persons.router)
app.include_router(relations.router)
app.include_router(graph.router)


@app.get("/health")
def health():
    return {"status": "ok"}
