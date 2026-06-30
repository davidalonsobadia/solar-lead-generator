# 🐳 Docker Compose Usage Guide

This project now uses a **single, simplified `docker-compose.yml`** file that works for both development and production.

---

## 🚀 Quick Start

### **Development Mode** (Default)

```bash
# Start all services for development
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

This starts:
- ✅ **api** - FastAPI application (port 8000)
- ✅ **worker** - Celery worker for async tasks
- ✅ **redis** - Message broker (port 6379)
- ✅ **db** - PostgreSQL database (port 5432)

---

## 📋 Available Services

### **Core Services** (Always Available)

| Service | Description | Port | Access |
|---------|-------------|------|--------|
| `api` | FastAPI application | 8000 | http://localhost:8000 |
| `worker` | Celery worker | - | (background) |
| `redis` | Message broker | 6379 | localhost:6379 |
| `db` | PostgreSQL database | 5432 | localhost:5432 |

### **Optional Services** (Use Profiles)

| Service | Profile | Description | Port | Command |
|---------|---------|-------------|------|---------|
| `caddy` | `production` | Reverse proxy | 80, 443 | `docker-compose --profile production up` |
| `adminer` | `tools` | Database UI | 8080 | `docker-compose --profile tools up` |

---

## 🎯 Common Commands

### **Start Services**

```bash
# Development (default)
docker-compose up

# Development with database UI (Adminer)
docker-compose --profile tools up

# Production (with Caddy reverse proxy)
docker-compose --profile production up

# All services including optional ones
docker-compose --profile production --profile tools up
```

### **Stop Services**

```bash
# Stop all running services
docker-compose down

# Stop and remove volumes (⚠️ deletes database data!)
docker-compose down -v

# Stop and remove orphaned containers
docker-compose down --remove-orphans
```

### **Rebuild Services**

```bash
# Rebuild all services
docker-compose build

# Rebuild and start
docker-compose up --build

# Rebuild specific service
docker-compose build api
```

### **View Logs**

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f db

# Last 100 lines
docker-compose logs --tail=100 api
```

### **Execute Commands in Containers**

```bash
# Run Python script
docker-compose exec api python scripts/create_api_client.py --name "test"

# Access database
docker-compose exec db psql -U postgres -d solar_lead_gen_db

# Access Redis CLI
docker-compose exec redis redis-cli

# Open bash shell in API container
docker-compose exec api bash

# Run Alembic migrations
docker-compose exec api alembic upgrade head
```

---

## ⚙️ Configuration

### **Environment Variables**

Edit `.env` file to configure services:

```bash
# Docker Compose Configuration
INSTALL_DEPS_ON_START=1  # Auto-install dependencies on start (dev only)
API_PORT=8000            # API port
DB_PORT=5432             # Database port
REDIS_PORT=6379          # Redis port
ADMINER_PORT=8080        # Adminer port

# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=solar_lead_gen_db

# Application Configuration
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/solar_lead_gen_db
REDIS_URL=redis://redis:6379/0
```

### **Port Customization**

Change ports in `.env`:

```bash
# Use different ports
API_PORT=9000
DB_PORT=5433
REDIS_PORT=6380
ADMINER_PORT=8081
```

Then restart:
```bash
docker-compose down
docker-compose up
```

---

## 🔧 Development vs Production

### **Development Mode** (Default)

Features:
- ✅ Source code mounted as volume (hot-reload)
- ✅ All ports exposed for debugging
- ✅ Auto-install dependencies on start
- ✅ Adminer available with `--profile tools`
- ❌ No Caddy reverse proxy

```bash
docker-compose up
```

### **Production Mode**

Features:
- ✅ Caddy reverse proxy (HTTPS)
- ✅ No source code mounting
- ✅ Minimal port exposure
- ❌ No hot-reload
- ❌ No Adminer

```bash
docker-compose --profile production up
```

**For production, comment out these lines in `docker-compose.yml`:**

```yaml
# In api and worker services:
volumes:
  - .:/app  # ← Comment this out
  - pip_cache:/root/.cache/pip

# In all services:
ports:
  - "8000:8000"  # ← Comment out exposed ports
```

---

## 🗄️ Database Management

### **Access Database**

```bash
# Using psql
docker-compose exec db psql -U postgres -d solar_lead_gen_db

# Using Adminer (web UI)
docker-compose --profile tools up -d
# Open http://localhost:8080
# Server: db
# Username: postgres
# Password: postgres
# Database: solar_lead_gen_db
```

### **Run Migrations**

```bash
# Migrations run automatically on startup (RUN_MIGRATIONS=1)
# Or run manually:
docker-compose exec api alembic upgrade head

# Create new migration
docker-compose exec api alembic revision --autogenerate -m "description"
```

### **Backup Database**

```bash
# Backup
docker-compose exec db pg_dump -U postgres solar_lead_gen_db > backup.sql

# Restore
docker-compose exec -T db psql -U postgres -d solar_lead_gen_db < backup.sql
```

---

## 🐛 Troubleshooting

### **Services Won't Start**

```bash
# Clean up and restart
docker-compose down --remove-orphans
docker network prune -f
docker-compose up --build
```

### **Database Connection Issues**

```bash
# Check if database is healthy
docker-compose ps db

# Check database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

### **Celery Worker Not Processing Tasks**

```bash
# Check worker logs
docker-compose logs -f worker

# Check Redis connection
docker-compose exec redis redis-cli ping

# Restart worker
docker-compose restart worker
```

### **Port Already in Use**

```bash
# Change port in .env
API_PORT=9000  # Instead of 8000

# Or stop conflicting service
lsof -ti:8000 | xargs kill -9
```

### **Permission Issues**

```bash
# Fix volume permissions
docker-compose exec api chown -R $(id -u):$(id -g) /app
```

---

## 🧹 Cleanup

### **Remove Everything**

```bash
# Stop and remove containers, networks
docker-compose down

# Also remove volumes (⚠️ deletes database!)
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Nuclear option - remove everything
docker-compose down -v --rmi all --remove-orphans
docker system prune -a --volumes -f
```

---

## 📚 Quick Reference

```bash
# Start development
docker-compose up

# Start with database UI
docker-compose --profile tools up

# Start production
docker-compose --profile production up

# Stop
docker-compose down

# Rebuild
docker-compose up --build

# Logs
docker-compose logs -f api

# Execute command
docker-compose exec api python scripts/create_api_client.py --name "test"

# Database access
docker-compose exec db psql -U postgres -d solar_lead_gen_db

# Clean restart
docker-compose down && docker-compose up --build
```

---

## ✅ Summary

- ✅ **Single file** - No more multiple compose files
- ✅ **Profiles** - Use `--profile` for optional services
- ✅ **Environment-based** - Configure via `.env`
- ✅ **Dev & Prod ready** - Works for both environments
- ✅ **Simple commands** - Just `docker-compose up`

Enjoy your simplified Docker setup! 🚀

