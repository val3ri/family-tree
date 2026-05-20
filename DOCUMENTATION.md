# 📚 Project Documentation (Family Tree)

This document provides a technical overview of the architecture, newly implemented features, user interface adaptation, and backup systems in the Family Tree application.

---

## 🛠️ Technology Stack
The application runs as a containerized stack managed via Docker Compose:
* **Frontend**: Angular v21 (Standalone Components) + D3.js v7 for rendering the interactive family graph.
* **Backend**: Python FastAPI (high-performance asynchronous web framework).
* **Database**: PostgreSQL (relational database storing profiles, relations, and photo metadata).
* **Styling**: Vanilla CSS / SCSS for custom animations and layout tokens.

---

## 💾 1. Full Backup & Restore System (ZIP Backup)

The backup system is designed to facilitate easy data portability and prevent data loss. The archive is a single `.zip` file containing **both all database records and the physical image files**.

### 📥 Exporting Data
* **Endpoint**: `GET /api/backup/export`
* **Mechanism**:
  1. The backend queries all rows from the database tables: `persons`, `relations`, and `person_photos`.
  2. The records are serialized into JSON format and stored as `backup.json` inside the archive. UUIDs, dates, and timestamps are formatted into ISO-standard string representations.
  3. All physical files from the `uploads/` directory (profile photos and gallery images) are added to the ZIP archive under an `uploads/` folder.
  4. The Angular client receives the archive as a `Blob` and triggers a download for a file named `family-tree-backup-YYYY-MM-DD.zip`.

### 📤 Importing Data
* **Endpoint**: `POST /api/backup/import`
* **Supported formats**: `.zip` (new full format including photos) and `.json` (legacy format — backwards compatible).
* **Mechanism (ZIP)**:
  1. The user selects a `.zip` archive file through the UI.
  2. A confirmation prompt warns the user that all current data will be erased and replaced.
  3. The backend extracts the archive: reads `backup.json` and copies all files from `uploads/` back into the uploads directory.
  4. The backend initiates a **database transaction** with a high isolation level:
     * **Cleanup**: Deletes records from child tables `relations` and `person_photos` first, followed by the parent table `persons`. This dependency order prevents Foreign Key constraint violations.
     * **Insertion**: Iterates through the JSON array elements, parsing ISO strings back into Python date, time, and UUID formats, and inserts them into their respective tables.
     * **Rollback Protection**: If any parsing or database integrity error occurs (e.g. corrupted file), the transaction triggers a complete rollback. The database is restored to its state prior to the import attempt.
  5. Upon successful insertion, the transaction commits, and the client-side UI is automatically refreshed.

---

## 📱 2. Mobile Version & Responsive UI

The application adapts automatically to screen widths below `600px` using CSS Media Queries.

### 🔝 Adaptive Toolbar
* **Previous issues**: Action buttons overlapped and ran off-screen on mobile devices.
* **Improvements**:
  - The toolbar rearranges into a two-row column layout (`flex-direction: column`).
  - Row 1 displays the "Back" button and the active person's name. Row 2 holds the actions (`PNG`, Theme toggle, `+ Relation`, `+ Person`).
  - Button text labels are shortened or replaced with compact representations.
  - The name container utilizes `text-overflow: ellipsis` to cleanly truncate long names with an ellipsis (`...`), maintaining structure.

### 🔽 Bottom Sheet Panel
* **Behavior**: The right-hand desktop details sidebar transforms into an intuitive, slide-up mobile bottom sheet.
* **UI styling**:
  - `position: fixed` with height set to `65vh` (occupying 65% of screen height).
  - Rounded top corners (`border-radius: 24px 24px 0 0`).
  - A visual "drag handle" pill at the top of the sheet.
  - Smooth animation (`slideUp`) using a `cubic-bezier(0.16, 1, 0.3, 1)` easing curve.
  - Semi-transparent background with a blur filter (`backdrop-filter: blur(8px)`) to dim the tree behind the sheet. Tapping outside the sheet automatically closes it.

---

## 🔍 3. Tree Navigation (Zoom & Center)

For large family trees, a robust navigation control system is implemented:
1. **Programmatic Zoom (`+` and `-`)**:
   - Screen buttons trigger smooth D3.js transitions, scaling the SVG element up or down by a factor of `1.3`.
2. **Auto-Center (⌖)**:
   - Instead of centering at hardcoded `(0,0)` coordinates, the button queries the coordinates of all currently rendered node elements (`liveNodes`).
   - Computes the bounding box of the tree (minimum/maximum X and Y coordinates).
   - Calculates the exact center of this bounding box and scales the viewport to fit the entire structure.
   - Executes a smooth 500ms SVG viewport transition.

---

## 📂 4. Backup JSON Structure

Sample payload representation:

```json
{
  "persons": [
    {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6",
      "first_name": "Ivan",
      "last_name": "Ivanov",
      "birth_date": "1950-05-12",
      "death_date": null,
      "generation_hint": 0,
      "bio": "Founder of the family line.",
      "photo_url": "/uploads/profile.jpg",
      "birth_place": "Sofia",
      "birth_time": "around noon",
      "death_place": null,
      "education": "University Degree in Engineering",
      "profession": "Engineer",
      "residence": "Sofia",
      "created_at": "2026-05-19T21:30:00.000000"
    }
  ],
  "relations": [
    {
      "id": "f5e4d3c2-b1a0-9e8d-7c6b-5a4f3e2d1c0b",
      "person_a_id": "a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6",
      "person_b_id": "98765432-10fe-dcba-9876-543210fedcba",
      "relation_type": "SPOUSE",
      "marriage_date": "1975-08-20",
      "marriage_place": "Sofia",
      "is_divorced": false,
      "created_at": "2026-05-19T21:35:00.000000"
    }
  ],
  "person_photos": []
}
```

---

## 🚀 5. Deployment Guide

This project is containerized for easy setup in development and production environments.

### 💻 5.1 Local Development
Prerequisites: **Docker** and **Docker Compose**.

1. Navigate to the project root folder.
2. Build and start the containers:
   ```bash
   docker compose up --build -d
   ```
3. Access services:
   - **Frontend App**: [http://localhost](http://localhost) (Port 80)
   - **Backend API (Swagger Docs)**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **PostgreSQL**: Port 5432

### 🌐 5.2 Production VPS Deployment
When hosting the project on a public VPS, adhere to these production practices:

1. **Secure Database Credentials**:
   Change default credentials by creating a `.env` file in the project root:
   ```env
   POSTGRES_USER=prod_family_user
   POSTGRES_PASSWORD=your_secure_password
   POSTGRES_DB=family_tree_prod
   DATABASE_URL=postgresql://prod_family_user:your_secure_password@db:5432/family_tree_prod
   ```

2. **Persisting Image Uploads**:
   * ZIP backups from the web UI contain **both the textual metadata and the physical image files**. A complete backup and restore is possible entirely through the web interface.
   * Uploaded photos are also stored in the Docker volume `uploads_data`. For an additional layer of redundancy (e.g. automated nightly server-side copies), the volume is located at `/var/lib/docker/volumes/<project_name>_uploads_data/_data` on the host system.

3. **HTTPS / SSL Configuration**:
   It is recommended to run a reverse proxy (like Nginx, Traefik, or Caddy) in front of the frontend container (Port 80) to enable Let's Encrypt SSL certificates.
   Sample Nginx Configuration:
   ```nginx
   server {
       listen 443 ssl;
       server_name mytree.domain.com;

       ssl_certificate /etc/letsencrypt/live/mytree.domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/mytree.domain.com/privkey.pem;

       location / {
           proxy_pass http://localhost:80;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

---

### 🍓 5.3 Raspberry Pi Deployment
The application has been verified to run on **Raspberry Pi** (Pi 4 or Pi 5 utilizing *Raspberry Pi OS 64-bit* or *Ubuntu Server 64-bit*).

#### ⚠️ Key Raspberry Pi Considerations:
1. **Architecture Compatibility**:
   All core Docker images (`python:3.12-slim`, `node:20-alpine`, `nginx:alpine`, `postgres:16-alpine`) natively support `linux/arm64`.
2. **Build Memory Constraints**:
   Compiling the Angular application (`npm run build`) can exceed the RAM capacity of 1GB/2GB Pi boards, causing compilation crashes.
   * **Workaround A**: Increase the operating system Swap size to 2GB.
   * **Workaround B (Recommended)**: Compile images on your primary development machine using Docker Buildx for the `linux/arm64` platform, push them to a container registry, and pull them directly to the Raspberry Pi to avoid local compilation stress. Detailed steps are in [deployment_raspberrypi.md](deployment_raspberrypi.md).
3. **Preventing SD Card Corruption**:
   High-frequency writes from PostgreSQL database operations can rapidly degrade a standard MicroSD card.
   * **Recommendation**: Mount Docker volumes (`postgres_data` and `uploads_data`) to an external SSD or a high-speed USB 3.0 storage drive.

---

### ☁️ 5.4 Cloud Hosting Models
If deploying the stack to cloud-native platforms, choose from the following models:

#### Model A: Simple VPS (Hetzner, DigitalOcean, AWS EC2)
The most straightforward path. Set up a lightweight Linux VPS (1 vCPU, 2GB RAM is sufficient), install Docker + Docker Compose, clone the repo, and start using `docker compose up -d`.

#### Model B: Container Platform-as-a-Service (Render, Fly.io, Railway)
If deploying directly from GitHub without configuring operating systems:
1. **Persistent Volumes**: Because images are uploaded locally to `/app/uploads` in the backend service, you must attach a **Persistent Disk/Volume** to the backend container in that folder. Otherwise, files are deleted whenever the container restarts.
2. **Database Integration**: Set up a managed PostgreSQL service (e.g. Supabase, Neon, or the PaaS provider's managed database) and pass its connection string as the `DATABASE_URL` environment variable.
