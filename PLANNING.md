# Family Tree App - Planning Document

## Description

A web application for family tree visualization. Users can view relatives as interactive nodes on an infinite canvas, zoom, drag the graph, and click on individual profiles to display detailed biographical information.

---

## Technology Stack

| Layer | Technology | Rationale |
|------|-----------|---------|
| Visualization | D3.js | Complete control over layouts, marriage nodes, and genealogical styling |
| Frontend | Angular | Developer familiarity and component structure |
| Backend | FastAPI (Python) | Lightweight, fast, well-suited for Raspberry Pi hosting |
| Database | PostgreSQL | Reliable relational storage accommodating complex connection structures |
| Photos | Local Uploads | Simple directory-based image storage on the host filesystem |
| Deployment | Docker Compose | Easy container deployment on Raspberry Pi and cloud environments |

---

## Project Structure

```
family-tree/
├── frontend/               # Angular + D3.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── tree/           # D3 canvas component
│   │   │   │   ├── person-panel/   # Right details side panel
│   │   │   │   ├── person-form/    # Form for adding/editing members
│   │   │   │   └── legend/         # Graph legends
│   │   │   ├── services/
│   │   │   │   ├── person.service.ts
│   │   │   │   └── relation.service.ts
│   │   │   └── models/
│   │   │       ├── person.model.ts
│   │   │       └── relation.model.ts
├── backend/                # FastAPI
│   ├── models/             # SQLAlchemy schemas
│   ├── routes/             # REST endpoints
│   ├── uploads/            # Uploaded profile files
│   └── main.py
└── docker-compose.yml
```

---

## Database Schema

### Table `persons`
| Field | Type | Description |
|------|-----|---------|
| id | UUID | Primary Key |
| first_name | VARCHAR | First name |
| last_name | VARCHAR | Last name |
| birth_date | DATE | Date of birth |
| death_date | DATE | Date of death (nullable) |
| bio | TEXT | Biography / personal summary |
| photo_url | VARCHAR | Path to uploaded image |
| created_at | TIMESTAMP | Creation timestamp |

### Table `relations`
| Field | Type | Description |
|------|-----|---------|
| id | UUID | Primary Key |
| person_a_id | UUID | FK to persons |
| person_b_id | UUID | FK to persons |
| relation_type | ENUM | Relationship type |

### Relationship Types (`relation_type`)
- `PARENT_CHILD` - Parent → Child
- `SPOUSE` - Spouses
- `SIBLING` - Siblings

> Derived relationships (grandparents, cousins, aunts/uncles) are **calculated dynamically** from the three basic relationship types.

---

## Visualization

### Principles
- Full Graph - All individuals are rendered simultaneously on the canvas.
- Generational alignment (older generations are positioned at the top).
- Active person highlighting and centering.
- Zoom in/out and drag-to-pan support.

### Marriage Nodes
Children connect visually to a virtual node representing the union of their parents:
```
[Grandfather]---[Grandmother]        [Grandfather2]---[Grandmother2]
            \  /                                  \  /
           [Father]-----------♦-----------[Mother]
                              |
                            [ME]
```

### Connector Lines Legend
| Color | Relationship |
|------|--------|
| Blue | Parent / Child |
| Red | Spouse |
| Green | Sibling |

### Click Interaction
1. Tapping/clicking a node opens the profile sidebar on the right.
2. The sidebar displays: photo, name, birth date, biography, and immediate relatives.
3. The focused person can be switched from the panel or from a dropdown selector.

---

## API Endpoints

### Persons
- `GET /persons` - Get all members
- `GET /persons/{id}` - Get single profile details
- `POST /persons` - Add new member
- `PUT /persons/{id}` - Edit member details
- `DELETE /persons/{id}` - Remove profile
- `POST /persons/{id}/photo` - Upload profile image

### Relations
- `GET /relations` - Get all relationship records
- `POST /relations` - Create relationship
- `DELETE /relations/{id}` - Remove relationship

### Graph
- `GET /graph` - Retrieve nodes and links simultaneously (optimized for D3.js consumption)

---

## Development Phases

### Phase 1 - Foundation
- [x] PostgreSQL Schema setup
- [x] FastAPI CRUD endpoints
- [x] Local photo upload support
- [x] Angular application structure

### Phase 2 - Visualization
- [x] D3 canvas rendering with nodes
- [x] Drag and zoom interactions
- [x] Marriage node layouts
- [x] Color-coded connection links
- [x] Node focus states

### Phase 3 - User Interface
- [x] Information details panel
- [x] Add/Edit forms
- [x] Legend overlay
- [x] Focus switching controls

### Phase 4 - Deployment
- [x] Docker Compose stack configuration
- [x] Raspberry Pi deployment verification

### Phase 5 - Future Backlog
- [ ] Automated relative calculator (cousins, uncles, etc.)
- [ ] Live search filtering
- [ ] Generation filters
- [ ] PDF printing exports
- [ ] Enhanced mobile user experience

---

## Mobile Adaptation

- Mobile support planned from inception using a desktop-first approach.
- Node elements sized to accommodate touch interactions.
- Native multi-touch pinch-to-zoom (leveraging D3 zoom gestures).
- Detail panel switches to a slide-up bottom sheet on smaller devices.
- Desktop forms accessible on mobile with responsive wrapping.

---

## Key Decisions

- **Sessionless Tree**: The focused root person is chosen in the UI rather than derived from an authentication state.
- **Minimal Relationship Seeds**: Only 3 core database relations; others computed algorithmically.
- **D3.js Selection**: Selected over standard layout frameworks (like React Flow) to implement custom marriage junctions and layouts.
- **Angular framework**: Selected based on developer expertise.
- **Full Viewport Canvas**: Visualizes the entire genealogical network at once rather than ego-centric local branches.
