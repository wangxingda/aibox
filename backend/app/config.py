from functools import lru_cache
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE / '.env', extra='ignore')
    database_url: str = 'mysql+pymysql://aireel:change-me@127.0.0.1:3306/aireel?charset=utf8mb4'
    redis_url: str = 'redis://127.0.0.1:6379/0'
    jwt_secret: str = ''
    comfyui_url: str = 'http://www.360.cn/comfy_0.43.0_url'
    comfyui_token: str = ''
    cors_origins: str = 'http://localhost:3000,http://localhost:3001'
    cookie_secure: bool = False
    workflow_config: str = 'workflows/registry.json'
    upload_dir: str = 'storage/uploads'
    task_timeout_seconds: int = 3600
    session_hours: int = 24

    @field_validator('jwt_secret')
    @classmethod
    def validate_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError('JWT_SECRET must contain at least 32 characters')
        return value

    def path(self, value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else BASE / path

@lru_cache
def settings() -> Settings:
    return Settings()
