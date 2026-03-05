# Render Deployment Guide

## Overview
This document describes how to deploy the billing platform to Render using free-tier compatible services, with source control and CI orchestrated from GitHub.

## Services

### billing-frontend
- **type**: web service
- **runtime**: node
- **plan**: free
- **responsibility**: serves the user-facing frontend

### billing-api
- **type**: web service
- **runtime**: node
- **plan**: free
- **responsibility**: API endpoints and business logic

### billing-worker
- **type**: background worker
- **runtime**: node
- **plan**: free
- **responsibility**: asynchronous/background job processing

## Database

### PostgreSQL
- **provider**: Render managed PostgreSQL
- **plan**: free
- **usage**: primary relational datastore for the platform

## Environment Variables
Configure environment variables in each Render service under **Service Settings → Environment**.

Recommended shared variables:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `APP_URL`
- `EMAIL_PROVIDER_KEY`

Service-specific notes:
- `billing-api` requires database, auth, and provider keys.
- `billing-worker` requires queue/database connectivity and auth context where applicable.
- `billing-frontend` requires `APP_URL` and API base URL settings as required by the frontend runtime.

## Service Dependencies
- `billing-frontend` depends on `billing-api` availability.
- `billing-api` depends on the Render PostgreSQL instance.
- `billing-worker` depends on both queue/backend resources and shared environment configuration.

## GitHub Integration
- Connect the GitHub repository to Render.
- Use Render Blueprint (`infrastructure/render/render.yaml`) for reproducible service definitions.
- Use GitHub Actions for build validation and optional deploy-hook triggering.
