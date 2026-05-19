from pathlib import Path
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from models.database import get_db, Person, Relation
from models.schemas import GraphResponse, GraphNode, GraphEdge

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/", response_model=GraphResponse)
def get_graph(db: Session = Depends(get_db)):
    persons = db.query(Person).all()
    relations = db.query(Relation).all()

    nodes = [
        GraphNode(
            id=p.id,
            first_name=p.first_name,
            last_name=p.last_name,
            birth_date=p.birth_date,
            death_date=p.death_date,
            generation_hint=p.generation_hint,
            photo_url=p.photo_url if p.photo_url and Path(p.photo_url.lstrip("/")).exists() else None,
        )
        for p in persons
    ]

    edges = [
        GraphEdge(
            id=r.id,
            person_a_id=r.person_a_id,
            person_b_id=r.person_b_id,
            relation_type=r.relation_type,
            is_divorced=r.is_divorced if r.relation_type.value == 'SPOUSE' else False,
        )
        for r in relations
    ]

    return GraphResponse(nodes=nodes, edges=edges)
