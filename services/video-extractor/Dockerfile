FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# F5：以非 root 用户运行，缩小容器被攻破时的横向影响面。
RUN useradd -m -u 10001 appuser

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .
COPY app ./app

ENV JOB_DB_PATH=/data/jobs.sqlite3 \
    WORK_DIR=/data/work \
    WHISPER_MODEL=small \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8 \
    HOME=/home/appuser

# /data 由运行时挂载；镜像里先建好并把归属交予 appuser，避免运行期写入被拒。
# 真实挂载卷若仍属 root，需在编排层设 securityContext.fsGroup 或保证卷可写。
RUN mkdir -p /data /home/appuser/.cache && chown -R appuser:appuser /app /data /home/appuser
USER appuser

VOLUME ["/data"]
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
