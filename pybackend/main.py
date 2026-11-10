import logging
import time
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path

from api.routes import embedding_router, anonymize_router, chat_router

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.
    
    Returns:
        Configured FastAPI application instance
    """
    app = FastAPI(
        title="Annotation Tool ML server",
        description="Provides LLM/ML services for the Dataset Annotation Tool",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc"
    )
    
    # Add CORS middleware for cross-origin requests
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:11434"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    logger = logging.getLogger("uvicorn.error")

    @app.middleware("http")
    async def log_request_time(request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s %s %.1f ms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response
    
    # Include routers
    app.include_router(embedding_router)
    app.include_router(anonymize_router)
    app.include_router(chat_router)
    
    # Root endpoint
    @app.get("/")
    async def root():
        """Root endpoint with API information."""
        return {
            "message": "Annotation Tool LLM/ML API",
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/health"
        }
    
    return app

app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
