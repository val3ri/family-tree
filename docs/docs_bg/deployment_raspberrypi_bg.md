# 🍓 Ръководство за внедряване на Raspberry Pi (Docker Image Transfer)

Това ръководство описва как да пренесете и стартирате готовите Docker образи (images) на вашето Raspberry Pi, спестявайки процесорно време и RAM ресурси при компилирането на Angular приложението локално на платката.

---

## 📋 Изисквания
* Raspberry Pi 4 или 5 с инсталирана **64-битова операционна система** (напр. *Raspberry Pi OS 64-bit* или *Ubuntu Server 64-bit*).
* Инсталиран **Docker** и **Docker Compose** на Raspberry Pi.
* Компютър за разработка (Mac или PC) в същата локална мрежа.

---

## 🛠️ Стъпка по стъпка

### 1. Билдване за ARM64 архитектура (на вашия компютър)
Raspberry Pi работи с ARM64 архитектура. Затова при компилиране на образите трябва да се уверим, че те са съвместими с тази платформа.

Влезте в главната папка на проекта на вашия компютър и изпълнете следните команди:
```bash
docker build --platform linux/arm64 -t family-tree-backend:latest ./backend
docker build --platform linux/arm64 -t family-tree-frontend:latest ./frontend
```
*Забележка: Ако вашият компютър е Mac с M1/M2/M3 чип, платформата ARM64 е стандартна, но добавянето на флага `--platform linux/arm64` гарантира пълна съвместимост.*

### 2. Експортиране на образите в архиви (.tar)
Запазете готовите образи като локални файлове:
```bash
docker save family-tree-backend:latest -o backend.tar
docker save family-tree-frontend:latest -o frontend.tar
```

### 3. Прехвърляне на файловете на Raspberry Pi
Копирайте генерираните `.tar` архиви към вашето Raspberry Pi (заменете `pi` и IP адреса с вашите реални потребител и хост):
```bash
scp backend.tar frontend.tar pi@<IP-на-Raspberry-Pi>:/home/pi/
```

### 4. Импортиране на образите в Docker на Raspberry Pi
Свържете се с Raspberry Pi през SSH и заредете образите от прехвърлените файлове:
```bash
docker load -i /home/pi/backend.tar
docker load -i /home/pi/frontend.tar
```
*След като зареждането приключи, можете да изтриете `.tar` архивите, за да освободите дисково пространство на Pi-то:*
```bash
rm /home/pi/backend.tar /home/pi/frontend.tar
```

### 5. Стартиране чрез Docker Compose на Raspberry Pi
Копирайте файловете от проекта (само `docker-compose.yml` и евентуално `.env`) на Raspberry Pi. 

Редактирайте `docker-compose.yml` на Raspberry Pi, за да използвате готовите образи директно, вместо да ги компилирате. Конфигурацията трябва да изглежда така:

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
    image: family-tree-backend:latest      # Използва заложения образ директно
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
    image: family-tree-frontend:latest     # Използва заложения образ директно
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  postgres_data:
  uploads_data:
```

Стартирайте контейнерите на Raspberry Pi с командата:
```bash
docker compose up -d
```

Сега вашето семейно дърво работи стабилно на Raspberry Pi на порт `80`!
