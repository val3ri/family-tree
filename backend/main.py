from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from models.database import Base, engine
from routes import persons, relations, graph
from config import settings

Base.metadata.create_all(bind=engine)

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
