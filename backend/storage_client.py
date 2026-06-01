"""
Object storage wrapper — Cloudflare R2 (S3-compatible) or local fallback.

R2 setup:
  R2_ACCOUNT_ID=...                    # da Cloudflare → R2 → Overview
  R2_ACCESS_KEY_ID=...                 # da Manage R2 API Tokens
  R2_SECRET_ACCESS_KEY=...             # da Manage R2 API Tokens
  R2_BUCKET=gestionale-crafteria
  R2_PUBLIC_URL=https://cdn.lacrafterianerd.com   # opzionale: public URL/CDN
"""
import os
import logging
from typing import Tuple

logger = logging.getLogger("crafteria.storage")

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "gestionale-crafteria")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
APP_NAME = os.environ.get("APP_NAME", "lacrafterianerd")

_client = None


def _r2_enabled() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY)


def _client_init():
    global _client
    if _client is not None:
        return _client
    if not _r2_enabled():
        return None
    try:
        import boto3
        from botocore.config import Config
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )
        logger.info("Cloudflare R2 storage initialized")
    except Exception as e:
        logger.error(f"R2 init failed: {e}")
        _client = None
    return _client


def init_storage():
    return _client_init()


def put_object(path: str, data: bytes, content_type: str) -> dict:
    client = _client_init()
    if not client:
        raise RuntimeError("Storage non configurato (mancano R2_* env vars)")
    client.put_object(
        Bucket=R2_BUCKET, Key=path, Body=data,
        ContentType=content_type,
        CacheControl="public, max-age=31536000",
    )
    return {"path": path, "size": len(data)}


def get_object(path: str) -> Tuple[bytes, str]:
    client = _client_init()
    if not client:
        raise RuntimeError("Storage non configurato")
    resp = client.get_object(Bucket=R2_BUCKET, Key=path)
    return resp["Body"].read(), resp.get("ContentType", "application/octet-stream")


def delete_object(path: str) -> None:
    client = _client_init()
    if not client:
        return
    try:
        client.delete_object(Bucket=R2_BUCKET, Key=path)
    except Exception as e:
        logger.warning(f"R2 delete failed for {path}: {e}")


def build_path(user_id: str, ext: str, file_id: str) -> str:
    return f"{APP_NAME}/uploads/{user_id}/{file_id}.{ext}"


def public_url_for(path: str) -> str:
    """Se è configurato R2_PUBLIC_URL, restituisce il link diretto senza autenticazione."""
    if R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL}/{path}"
    return ""
