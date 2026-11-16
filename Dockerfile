FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend

WORKDIR /app/backend
ENV PORT=8001
CMD ["sh", "-c", "exec python -m uvicorn server:app --host 0.0.0.0 --port \"$PORT\""]
