# TaskFlow Backend

A clean, production-ready FastAPI backend starter template with authentication, user management, and task lists.

## ✨ Features

- ✅ **FastAPI** - Modern, fast web framework
- ✅ **Authentication** - JWT-based auth with email verification
- ✅ **Email System** - Resend integration with beautiful HTML templates
- ✅ **Async Tasks** - Celery for background job processing
- ✅ **Database** - PostgreSQL with SQLAlchemy ORM
- ✅ **Migrations** - Alembic for database migrations
- ✅ **Docker** - Single docker-compose.yml for dev and production
- ✅ **API Documentation** - Auto-generated with Swagger/OpenAPI

---

## 🚀 Quick Start

### **1. Clone and Setup**

```bash
# Clone the repository
git clone https://github.com/yourusername/solar-lead-gen-backend.git
cd solar-lead-gen-backend

# Copy environment file
cp .env.example .env

# Edit .env and add your Resend API key
# RESEND_API_KEY=re_your_key_here
```

### **2. Start with Docker**

```bash
# Start all services
docker-compose up

# Or run in background
docker-compose up -d
```

That's it! 🎉

### **3. Create an API Key**

Before making requests to the API, you need to create an API key:

```bash
# Create an API client with a name (e.g., "frontend" for the frontend app)
docker-compose exec api python scripts/create_api_client.py --name "frontend"
```

The script will output your API key. **Save this key securely** - you won't be able to see it again!

Example output:
```
✅ API key created for 'frontend'
🔑 Here is the API key (save it securely!):

your-api-key-here
```

**For Frontend Setup:**
1. Copy the API key from the output above
2. Create a `.env.local` file in the `frontend/` directory (or add to existing `.env`)
3. Add the following:
   ```bash
   NEXT_PUBLIC_API_KEY=your-api-key-here
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```
4. Restart your frontend development server

### **4. Access the Application**

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/v1/health

---

## 📋 What's Included

### **Core Services**

- **API** - FastAPI application (port 8000)
- **Worker** - Celery worker for async tasks
- **Redis** - Message broker for Celery
- **Database** - PostgreSQL database

### **Domains**

- **Auth** - User registration, login, email verification, password reset
- **Users** - User management
- **Lists** - Task list management
- **API Clients** - API key management

---

## 📚 Documentation

- **[DOCKER_USAGE.md](DOCKER_USAGE.md)** - Complete Docker guide
- **[API_TESTING_WITH_EMAIL.md](API_TESTING_WITH_EMAIL.md)** - API testing guide (deleted, needs recreation)
- **[EMAIL_VERIFICATION_GUIDE.md](EMAIL_VERIFICATION_GUIDE.md)** - Email setup guide (deleted, needs recreation)

---

## 🔧 Configuration

### **Required Environment Variables**

```bash
# Email (Resend)
RESEND_API_KEY=re_your_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/solar_lead_gen_db

# Redis
REDIS_URL=redis://redis:6379/0

# Security
SECRET_KEY=your-secret-key-here
```

See `.env.example` for all available options.

---

## 🔑 API Key Authentication

All API requests (except health checks and documentation endpoints) require an API key to be included in the request headers.

### **How It Works**

1. **Create an API key** using the script (see Quick Start section)
2. **Include the key** in all requests using the `x-api-key` header
3. The API key is validated on every request

### **Exempt Endpoints**

The following endpoints don't require an API key:
- `/api/v1/health` - Health check
- `/docs` - Swagger documentation
- `/openapi.json` - OpenAPI schema
- `/redoc` - ReDoc documentation

---

## 🧪 Testing the API

> **Note**: Replace `YOUR_API_KEY` with the actual API key you created in the Quick Start section.

### **Register a User**

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePassword123!"
  }'
```

### **Login**

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePassword123!"
  }'
```

### **Create a List**

```bash
curl -X POST http://localhost:8000/api/v1/lists \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Tasks",
    "description": "Things to do"
  }'
```

> **Note**: Most endpoints require both an API key (`x-api-key` header) and an authentication token (`Authorization: Bearer` header) for authenticated requests.

---

## 🛠️ Common Commands

```bash
# Start services
docker-compose up

# Start with database UI (Adminer)
docker-compose --profile tools up

# View logs
docker-compose logs -f api

# Stop services
docker-compose down

# Rebuild
docker-compose up --build

# Run migrations
docker-compose exec api alembic upgrade head

# Create API client
docker-compose exec api python scripts/create_api_client.py --name "my-client"

# Access database
docker-compose exec db psql -U postgres -d solar_lead_gen_db
```

---

## 📁 Project Structure

```
solar-lead-gen-backend/
├── app/
│   ├── api/              # API routes
│   ├── core/             # Core utilities (config, email, etc.)
│   ├── db/               # Database configuration
│   ├── domains/          # Business logic domains
│   │   ├── auth/         # Authentication
│   │   ├── users/        # User management
│   │   ├── lists/        # Task lists
│   │   └── api_clients/  # API key management
│   ├── templates/        # Email templates
│   └── main.py           # Application entry point
├── alembic/              # Database migrations
├── scripts/              # Utility scripts
├── tests/                # Test suite
├── docker-compose.yml    # Docker configuration
├── Dockerfile            # Docker image
└── .env                  # Environment variables
```

---

## 🔐 Email Verification Flow

1. User registers → Email sent with verification link
2. User clicks link → Email verified
3. Welcome email sent
4. User can now login

All emails are sent asynchronously via Celery!

---

## 🚀 Production Deployment

### **1. Update Environment**

```bash
# Set production values in .env
APP_ENV=production
FRONTEND_URL=https://app.yourdomain.com
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### **2. Start with Caddy (HTTPS)**

```bash
docker-compose --profile production up -d
```

### **3. Configure Domain**

Update `Caddyfile` with your domain name.

---

## 🐛 Troubleshooting

### **Services won't start?**

```bash
docker-compose down --remove-orphans
docker network prune -f
docker-compose up --build
```

### **Can't login after registration?**

Users must verify their email first. Check Celery worker logs:

```bash
docker-compose logs -f worker
```

Or manually verify in database:

```bash
docker-compose exec db psql -U postgres -d solar_lead_gen_db -c \
  "UPDATE users SET is_verified = true WHERE email = 'user@example.com';"
```

---

## 📖 API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🤝 Contributing

This is a starter template. Feel free to:
- Add new domains
- Customize email templates
- Add more features
- Improve documentation

---

## 📝 License

MIT License - feel free to use this for your projects!

---

## 🎯 Next Steps

1. **Get Resend API key** from https://resend.com
2. **Update `.env`** with your API key
3. **Start services** with `docker-compose up`
4. **Create an API key** using `docker-compose exec api python scripts/create_api_client.py --name "my-client"`
5. **Test the API** using the examples above (don't forget to include your API key!)
6. **Customize** for your needs!

Happy coding! 🚀

