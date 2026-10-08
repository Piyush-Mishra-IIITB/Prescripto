# Prescripto --- AI-Powered Doctor Appointment & Tele-Consultation Platform

Prescripto is a full-stack healthcare platform combining AI-assisted
specialist recommendation, doctor appointment booking, online payments,
real-time communication, and WebRTC-based video consultation.

> **Prescripto = AI Triage + Doctor Discovery + Appointment Booking +
> Payment + Tele-Consultation**

## 🌐 Live Deployment

-   **User App:** https://medlink360-frontend.onrender.com
-   **Admin Panel:** https://medlink360-admin.onrender.com
-   **Backend API:** https://medlink-backend-2bgo.onrender.com
-   **AI Service:** https://medlink360.onrender.com
-   **RAG Medical Assistant:** Not currently deployed

------------------------------------------------------------------------

## 🎯 Problem Statement

Patients may not know which medical specialist they should consult.
Prescripto introduces an AI triage layer before doctor selection and
booking.

``` text
Patient Symptoms
       │
       ▼
   Backend API
       │
       ▼
  ML Prediction
       │
       ▼
Recommended Specialist
       │
       ▼
Matching Doctors
       │
       ▼
Appointment Booking
       │
       ▼
     Payment
       │
       ▼
Tele-Consultation
```

------------------------------------------------------------------------

# ✨ Key Features

### Patient

-   JWT authentication
-   Profile management
-   AI-based specialist recommendation
-   Doctor discovery
-   Appointment booking and cancellation
-   Appointment history
-   Razorpay payments
-   Real-time chat
-   WebRTC video consultation

### Doctor

-   Secure login
-   Profile management
-   Availability management
-   Appointment management
-   Appointment completion
-   Cancellation of unpaid appointments
-   Earnings dashboard
-   Real-time consultation

### Admin

-   Admin authentication
-   Add and manage doctors
-   Toggle doctor availability
-   View and cancel appointments
-   Dashboard analytics

------------------------------------------------------------------------

# 🤖 AI Medical Triage

``` mermaid
flowchart LR
    S[Patient Symptoms] --> API[Node.js Backend]
    API --> ML[FastAPI ML Service]
    ML --> MODEL[Scikit-learn Model]
    MODEL --> SP[Predicted Specialist]
    SP --> API
    API --> DB[(MongoDB)]
    DB --> DOC[Matching Doctors]
```

The ML inference service uses Python, FastAPI, Scikit-learn, and Joblib.

------------------------------------------------------------------------

# 🧠 RAG Medical Assistant

Prescripto also contains a separate Retrieval-Augmented Generation (RAG)
service for general medical information retrieval.

``` mermaid
flowchart LR
    U[Patient Query] --> API[Node.js Backend]
    API --> RAG[FastAPI RAG Service]
    RAG --> EMB[BAAI/bge-small-en-v1.5]
    EMB --> FAISS[(FAISS Vector Store)]
    FAISS --> RET[Relevant Medical Context]
    RET --> GEM[Gemini]
    GEM --> RAG
    RAG --> API
    API --> U
```

The RAG pipeline consists of:

``` text
Medical Documents
       │
       ▼
Document Ingestion
       │
       ▼
Text Chunking
       │
       ▼
BGE Embeddings
       │
       ▼
FAISS Index
       │
       ▼
Semantic Retrieval
       │
       ▼
Relevant Context
       │
       ▼
Gemini
       │
       ▼
Medical Information Response
```

### RAG Service Structure

``` text
rag-service/
├── app/
│   ├── ingest.py
│   ├── embeddings.py
│   ├── build_index.py
│   ├── retriever.py
│   ├── generator.py
│   └── main.py
├── data/
│   └── documents/
│       ├── hypertension.md
│       ├── diabetes.md
│       ├── asthma.md
│       ├── gerd.md
│       ├── migraine.md
│       ├── common-cold.md
│       ├── pneumonia.md
│       └── fever.md
├── vectorstore/
│   ├── index.faiss
│   └── metadata.json
└── requirements.txt
```

The RAG service uses Sentence Transformers with `BAAI/bge-small-en-v1.5`,
FAISS for vector retrieval, and Gemini for response generation.

> **Deployment status:** The RAG service is implemented and tested locally,
> but is currently not deployed because the embedding model exceeds the
> memory available in the free hosting environment. The implementation
> remains in the repository for future deployment on a higher-memory
> environment.

The Medical Assistant page remains available in the application and
currently displays that the assistant is unavailable.

> The RAG assistant is intended for general medical education only. It is
> not a diagnostic or treatment system and should not replace professional
> medical advice.

------------------------------------------------------------------------

# 🏗️ System Architecture

``` mermaid
flowchart TD
    U[Patient] --> FE[React Patient App]
    D[Doctor] --> FE
    A[Admin] --> ADMIN[React Admin Panel]

    FE --> API[Node.js + Express]
    ADMIN --> API

    API --> DB[(MongoDB)]
    API --> REDIS[(Redis)]
    API --> ML[FastAPI ML Service]
    API --> PAY[Razorpay]
    API --> CLOUD[Cloudinary]
    API --> SOCKET[Socket.IO Signaling]

    SOCKET --> WEBRTC[WebRTC]
    U -. Peer-to-Peer Media .-> WEBRTC
    D -. Peer-to-Peer Media .-> WEBRTC
```

------------------------------------------------------------------------

# ⚡ Redis

Redis is used for **caching and distributed locking**.

## Doctor List Caching

``` mermaid
flowchart TD
    R[Doctor List Request] --> C{Redis Cache}
    C -->|HIT| H[Return Cached Doctors]
    C -->|MISS| M[Query MongoDB]
    M --> SET[Cache Result]
    SET --> OUT[Return Doctors]
    H --> OUT
```

Cache key:

``` text
doctors:list
```

TTL:

``` text
600 seconds
```

The cache is invalidated whenever relevant doctor availability or
appointment-slot data changes.

## Appointment Distributed Locking

``` mermaid
sequenceDiagram
    participant P1 as Booking Request A
    participant R as Redis
    participant DB as MongoDB
    participant P2 as Booking Request B

    P1->>R: SET slot lock NX
    R-->>P1: Lock acquired

    P2->>R: SET same lock NX
    R-->>P2: Lock rejected

    P1->>DB: Check slot
    P1->>DB: Create appointment
    P1->>DB: Update doctor slots
    P1->>R: Invalidate doctor cache
    P1->>R: Release lock
```

The booking lock uses a unique token, `NX`, an expiration, and an atomic
token-checked release.

------------------------------------------------------------------------

# 📅 Appointment Booking

``` mermaid
sequenceDiagram
    participant U as Patient
    participant API as Backend
    participant R as Redis
    participant DB as MongoDB

    U->>API: Book appointment
    API->>R: Acquire slot lock

    alt Lock unavailable
        R-->>API: Reject lock
        API-->>U: Try again
    else Lock acquired
        R-->>API: Lock acquired
        API->>DB: Find doctor
        API->>DB: Check slot

        alt Slot unavailable
            API->>R: Release lock
            API-->>U: Slot unavailable
        else Slot available
            API->>DB: Create appointment
            API->>DB: Update doctor slot
            API->>R: Invalidate doctors:list
            API->>R: Release lock
            API-->>U: Appointment created
        end
    end
```

------------------------------------------------------------------------

# 💳 Payment Flow

``` mermaid
sequenceDiagram
    participant U as Patient
    participant API as Backend
    participant RP as Razorpay
    participant DB as MongoDB

    U->>API: Request payment order
    API->>DB: Validate appointment
    API->>RP: Create order
    RP-->>API: Order details
    API-->>U: Payment order

    U->>RP: Complete payment
    RP-->>U: Payment ID + signature

    U->>API: Verify payment
    API->>API: Generate HMAC signature
    API->>RP: Fetch order
    RP-->>API: Order details
    API->>DB: Mark appointment paid
    API-->>U: Payment verified
```

------------------------------------------------------------------------

# 🎥 Tele-Consultation

Prescripto uses Socket.IO for signaling and WebRTC for peer-to-peer
media.

The consultation room maintains authoritative room state and handles
room readiness, duplicate peers, and disconnects.

------------------------------------------------------------------------

# 🧰 Tech Stack

  Layer             Technologies
  ----------------- ----------------------------------------
  Frontend          React, Vite, Tailwind CSS, Context API
  Backend           Node.js, Express.js
  Database          MongoDB, Mongoose
  Cache & Locking   Redis
  Authentication    JWT, bcrypt
  Real-Time         Socket.IO
  Video             WebRTC, ICE/STUN
  Payments          Razorpay
  Media Storage     Cloudinary, Multer
  ML                Python, FastAPI, Scikit-learn, Joblib
  RAG               FastAPI, FAISS, Sentence Transformers, Gemini
  Deployment        Render

------------------------------------------------------------------------

# 📡 REST API

## Admin --- `/api/admin`

  Method   Endpoint                     Description
  -------- ---------------------------- ---------------------
  POST     `/login`                     Admin login
  POST     `/add-doctor`                Add doctor
  GET      `/all-doctor`                List doctors
  PATCH    `/change-availability/:id`   Toggle availability
  GET      `/appointments`              View appointments
  POST     `/cancel-appointment`        Cancel appointment
  GET      `/dashboard`                 Analytics

## Doctor --- `/api/doctor`

  Method   Endpoint                  Description
  -------- ------------------------- ---------------------------
  POST     `/login`                  Doctor login
  GET      `/appointments`           Doctor appointments
  POST     `/complete-appointment`   Complete appointment
  POST     `/cancel-appointment`     Cancel unpaid appointment
  GET      `/dashboard`              Earnings
  GET      `/profile`                Doctor profile
  POST     `/update-profile`         Update profile

## User --- `/api/user`

  Method   Endpoint                Description
  -------- ----------------------- ----------------------
  POST     `/register`             Register
  POST     `/login`                Login
  GET      `/get-profile`          Get profile
  POST     `/update-profile`       Update profile
  POST     `/book-appointment`     Book appointment
  GET      `/appointments`         Appointment history
  POST     `/cancel-appointment`   Cancel appointment
  POST     `/payment-razorpay`     Create payment order
  POST     `/verifyRazorpay`       Verify payment

## AI Recommendation --- `/api/ai-recommend`

  Method   Endpoint     Description
  -------- ------------ ----------------------------------
  POST     `/predict`   Predict specialist from symptoms

## RAG Medical Assistant --- `/api/rag`

  Method   Endpoint     Description
  -------- ------------ ----------------------------------
  POST     `/chat`      Retrieve medical context and generate an answer

------------------------------------------------------------------------

# 📁 Project Structure

``` text
Doctor-client/
├── admin/
├── frontend/
├── backend/
│   ├── config/
│   │   ├── mongodb.js
│   │   ├── cloudinary.js
│   │   └── redis.js
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middlewares/
│   ├── socket/
│   ├── utils/
│   ├── server.js
│   ├── package.json
│   └── .env
├── ml-service/
├── rag-service/
│   ├── app/
│   ├── data/
│   ├── vectorstore/
│   └── requirements.txt
├── .gitignore
└── README.md
```

> The existing repository contains the controller directory as
> `contollers/` and the user controller file as `uerController.js`;
> those names are preserved here to match the current project.

------------------------------------------------------------------------

# ⚙️ Local Setup

### Backend

``` bash
cd backend
npm install
npm run dev
```

### Frontend

``` bash
cd frontend
npm install
npm run dev
```

### Admin

``` bash
cd admin
npm install
npm run dev
```

### AI Service

``` bash
cd ml-service
pip install -r requirements.txt
uvicorn main:app --reload
```

### RAG Service

The RAG service is currently intended for local development/testing.

``` bash
cd rag-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8001
```

On Windows:

``` bash
venv\\Scripts\\activate
```

Local RAG service:

``` text
http://127.0.0.1:8001
```

------------------------------------------------------------------------

# 🔐 Environment Variables

Create `.env` files using `.env.example`.

### Backend

``` env
MONGODB_URL=
JWT_SECRET=

CLOUDINARY_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_SECRET_KEY=

RAZORPAY_KEY_ID=
RAZORPAY_SECRET=

ML_API_URL=

RAG_SERVICE_URL=

REDIS_URL=
```

For local Redis:

``` env
REDIS_URL=redis://localhost:6379
```

For local RAG:

``` env
RAG_SERVICE_URL=http://127.0.0.1:8001
```

### RAG Service

``` env
GEMINI_API_KEY=
```

For production, configure `REDIS_URL` using the Redis connection URL
provided by the deployment platform.

**Never commit real credentials or connection secrets to GitHub.**

------------------------------------------------------------------------

# 🔒 Security

-   JWT authentication
-   Role-based authorization
-   bcrypt password hashing
-   Razorpay server-side signature verification
-   Environment-based secrets
-   Protected admin/doctor operations
-   Redis distributed locking for appointment concurrency
-   Authenticated RAG service integration
-   Environment-based RAG configuration

------------------------------------------------------------------------

# 🧪 Engineering Highlights

-   **AI-assisted triage:** symptoms are converted into a recommended
    specialist.
-   **Separate ML service:** FastAPI provides independent model
    inference.
-   **RAG medical assistant:** FAISS retrieval and Gemini generation
    provide grounded medical information responses.
-   **Separate RAG service:** FastAPI isolates retrieval and generation
    from the main backend.
-   **Redis caching:** frequently requested doctor data is cached.
-   **Distributed locking:** concurrent requests for the same
    appointment slot are serialized.
-   **Cache invalidation:** doctor cache is invalidated after relevant
    mutations.
-   **Payment verification:** Razorpay signatures are verified
    server-side.
-   **Real-time signaling:** Socket.IO coordinates consultation setup.
-   **Peer-to-peer video:** WebRTC handles media communication.
-   **Authoritative consultation state:** the server controls room
    readiness and participant state.

------------------------------------------------------------------------

# 📊 Feature Status

  Feature                        Status
  ------------------------------ --------
  Patient Authentication         ✅
  Doctor Authentication          ✅
  Admin Authentication           ✅
  Doctor Management              ✅
  Appointment Booking            ✅
  Appointment Cancellation       ✅
  Appointment History            ✅
  Razorpay Payment               ✅
  AI Specialist Recommendation   ✅
  Doctor Recommendation          ✅
  Redis Caching                  ✅
  Redis Distributed Locking      ✅
  Real-Time Chat                 ✅
  WebRTC Video Consultation      ✅
  Admin Analytics                ✅
  Separate ML Service            ✅
  Cloud Deployment               ✅

------------------------------------------------------------------------

# 🧪 RAG Deployment Status

The RAG Medical Assistant is implemented and works locally.

Production deployment is currently deferred because the Sentence Transformer
embedding model requires more memory than the available free hosting
environment provides.

``` text
RAG Implementation        → ✅ Complete
RAG Local Testing         → ✅ Complete
Backend Integration       → ✅ Complete
Production Deployment     → ⏸️ Deferred
```

The RAG code, medical documents, FAISS index, and metadata remain in the
repository so the service can be deployed later on a higher-memory platform.

------------------------------------------------------------------------

# 🚀 Production Architecture

``` mermaid
flowchart TB
    USER[Patient]
    DOC[Doctor]
    ADMIN[Admin]

    APP[React Patient App]
    ADMINAPP[React Admin Panel]
    API[Node.js / Express Backend]

    MONGO[(MongoDB)]
    REDIS[(Redis)]
    ML[FastAPI ML Service]
    RAZORPAY[Razorpay]
    CLOUD[Cloudinary]
    SOCKET[Socket.IO]
    RTC[WebRTC]

    USER --> APP
    DOC --> APP
    ADMIN --> ADMINAPP

    APP --> API
    ADMINAPP --> API

    API --> MONGO
    API --> REDIS
    API --> ML
    API --> RAZORPAY
    API --> CLOUD
    API --> SOCKET

    SOCKET --> RTC
    USER -. Media .-> RTC
    DOC -. Media .-> RTC
```

------------------------------------------------------------------------

# 🏁 Project Summary

Prescripto demonstrates an end-to-end healthcare platform that combines:

``` text
AI Triage
     +
Doctor Discovery
     +
Appointment Booking
     +
Redis Caching
     +
Distributed Locking
     +
Online Payments
     +
Real-Time Communication
     +
WebRTC Video Consultation
```

The project is designed to demonstrate practical full-stack engineering
together with machine learning integration, real-time systems, caching,
concurrency control, and cloud deployment.

------------------------------------------------------------------------

## 👨‍💻 Author

**Piyush Mishra**\
B.Tech --- IIIT Bhopal
