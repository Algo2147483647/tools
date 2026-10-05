FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY main.py ./main.py
RUN useradd --create-home vector && mkdir -p /app/var && chown vector:vector /app/var
USER vector
ENV VECTOR_DATA_DIR=/app/var
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
