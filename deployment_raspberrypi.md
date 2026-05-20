# 🍓 Raspberry Pi Deployment Guide (Docker Image Transfer)

This guide explains how to compile, transfer, and run pre-built Docker images on a Raspberry Pi, saving CPU and RAM resources by avoiding compilation directly on the board.

---

## 📋 Prerequisites
* A Raspberry Pi 4 or 5 running a **64-bit operating system** (e.g., *Raspberry Pi OS 64-bit* or *Ubuntu Server 64-bit*).
* **Docker** and **Docker Compose** installed on the Raspberry Pi.
* A development computer (Mac or PC) located on the same local network.

---

## 🛠️ Step-by-Step Instructions

### 1. Build for the ARM64 Platform (On Development Computer)
The Raspberry Pi utilizes an ARM64 processor. We must build our Docker images targeting this specific architecture.

Open the terminal in the root directory of the project on your development computer and execute:
```bash
docker build --platform linux/arm64 -t family-tree-backend:latest ./backend
docker build --platform linux/arm64 -t family-tree-frontend:latest ./frontend
```
*Note: If your development computer is an Apple Silicon Mac (M1/M2/M3), it defaults to ARM64, but using the `--platform linux/arm64` flag ensures absolute container compatibility.*

### 2. Save Images to Compressed Tarballs
Export the freshly built Docker images into compressed files:
```bash
docker save family-tree-backend:latest -o backend.tar
docker save family-tree-frontend:latest -o frontend.tar
```

### 3. Transfer Tarballs to the Raspberry Pi
Copy the `.tar` files to your Raspberry Pi using `scp` (replace `pi` and the IP address with your actual credentials):
```bash
scp backend.tar frontend.tar pi@<IP-of-Raspberry-Pi>:/home/pi/
```

### 4. Load Images into Docker on the Raspberry Pi
Establish an SSH session to your Raspberry Pi and load the images:
```bash
docker load -i /home/pi/backend.tar
docker load -i /home/pi/frontend.tar
```
*Once loaded, remove the tarballs to free up storage space on the Pi's drive:*
```bash
rm /home/pi/backend.tar /home/pi/frontend.tar
```

### 5. Start Containers using Docker Compose
Transfer the project configuration files (specifically `docker-compose.yml` and optionally `.env`) to the Raspberry Pi.

Edit `docker-compose.yml` on the Pi to target the loaded images directly instead of compiling them. Modify the service definitions as follows:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: family
      POSTGRES_PASSWORD: family_secret
      POSTGRES_DB: family_tree
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    image: family-tree-backend:latest      # Runs the loaded image directly
    restart: unless-stopped
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://family:family_secret@db:5432/family_tree
      UPLOADS_DIR: /app/uploads
    volumes:
      - uploads_data:/app/uploads
    ports:
      - "8000:8000"

  frontend:
    image: family-tree-frontend:latest     # Runs the loaded image directly
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  postgres_data:
  uploads_data:
```

Spin up the containers on the Raspberry Pi:
```bash
docker compose up -d
```

The application will now boot and be accessible on Port `80` (e.g. `http://<IP-of-Raspberry-Pi>`)!
