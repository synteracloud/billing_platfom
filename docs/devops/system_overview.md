# System Overview

## High-Level System Architecture
This platform follows a service-oriented web application architecture with a user-facing frontend, a backend API, asynchronous background processing, and shared data services.

## System Services
- **api-service** (backend API and business logic)
- **worker-service** (background job processing)
- **scheduler-service** (scheduled/cron task orchestration)
- **frontend** (Next.js user interface)
- **postgres** (primary relational database)
- **redis** (cache and job queue broker)

## Runtime Topology
- `frontend -> api-service`
- `api-service -> postgres`
- `api-service -> redis`
- `worker-service -> redis` (queue consumption)
- `scheduler-service -> redis` (queue/job enqueue)

## Dependency Graph
- `frontend` depends on `api-service`
- `api-service` depends on `postgres` and `redis`
- `worker-service` depends on `redis` and (indirectly) API/domain schema compatibility
- `scheduler-service` depends on `redis` and shared job contracts
- `postgres` and `redis` are foundational services for runtime operations

## Deployment Targets

Primary hosting platform:
- Render (free tier)

Repository host:
- GitHub

Services deployed:
- `frontend` -> Render web service
- `api-service` -> Render web service
- `worker-service` -> Render background worker
- `database` -> Render PostgreSQL free tier

## Environments
- **development**: local developer environment with local dependencies
- **staging**: pre-production validation environment
- **production**: live customer-facing environment

This document is intended as the fast-start architecture map for DevOps automation.
