# Health Checks

## Service Health Endpoints
- **api-service**: `GET /health`
  - Confirms API process availability and basic dependency connectivity.

- **worker-service**: queue health
  - Confirms worker process is running and able to consume queue messages.
  - Suggested signal: queue lag and active consumer count.

- **scheduler-service**: scheduler health
  - Confirms scheduler loop is active and jobs are enqueueing on schedule.
  - Suggested signal: last successful scheduling timestamp.

## Operational Guidance
- Health checks should be lightweight and safe for frequent polling.
- Alert on sustained unhealthy states rather than transient failures.
- Pair liveness/readiness checks with logs and metrics for diagnosis.
