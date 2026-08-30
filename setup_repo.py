import os
import subprocess
import sys
from pathlib import Path

# Configuration
PROJECT_ROOT = Path(__file__).resolve().parent
REQUIREMENTS_PATH = PROJECT_ROOT / "pybackend" / "requirements.txt"
VENV_DIR_NAMES = ["cais", "venv"]
SEARCH_PATHS = [PROJECT_ROOT / "pybackend", PROJECT_ROOT]
DEFAULT_VENV_PATH = PROJECT_ROOT / "pybackend" / "venv"

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "annotationTool")

# Runtime directories used by backend, pybackend, and deployment scripts.
DIRECTORIES_TO_CREATE = [
    "shared_uploads",
    "shared_uploads/anonymize",
    "val_datasets",
    "rest_datasets",
    "guide_datasets",
    "metrics",
    "generated_codebooks",
    "pybackend/bin",
    "pybackend/data/mongodb",
]

COLLECTIONS_TO_CREATE = [
    "UserDetails",
    "TaskDetails",
    "AnnotationDetails",
    "AnonymizeConfig",
]


def get_venv_path():
    """Find an existing virtual environment or return the default creation path."""
    for search_path in SEARCH_PATHS:
        for venv_name in VENV_DIR_NAMES:
            full_path = search_path / venv_name
            if (full_path / "pyvenv.cfg").exists():
                return full_path

    return DEFAULT_VENV_PATH


def get_venv_python(venv_path):
    """Return the python executable path inside the virtual environment."""
    if sys.platform == "win32":
        return venv_path / "Scripts" / "python.exe"
    return venv_path / "bin" / "python"


def create_venv(venv_path):
    """Create a virtual environment."""
    print(f"Creating virtual environment at {venv_path}...")
    try:
        subprocess.check_call([sys.executable, "-m", "venv", str(venv_path)])
        return True
    except subprocess.CalledProcessError:
        print("Error: Failed to create virtual environment.")
        return False


def install_dependencies(python_path):
    """Install Python dependencies using the virtual environment's pip."""
    if not REQUIREMENTS_PATH.exists():
        print(f"Error: {REQUIREMENTS_PATH} not found.")
        return False

    print(f"Installing dependencies from {REQUIREMENTS_PATH}...")
    try:
        subprocess.check_call(
            [str(python_path), "-m", "pip", "install", "-r", str(REQUIREMENTS_PATH)]
        )
        print("Dependencies installed successfully.")
        return True
    except subprocess.CalledProcessError:
        print("Error: Failed to install dependencies.")
        return False


def setup_directories():
    """Create the runtime directories expected by the project."""
    for relative_path in DIRECTORIES_TO_CREATE:
        directory = PROJECT_ROOT / relative_path
        try:
            directory.mkdir(parents=True, exist_ok=True)
            print(f"Ensured directory exists: {relative_path}")
        except OSError as exc:
            print(f"Error creating directory {relative_path}: {exc}")


def ensure_collection(db, collection_name):
    """Create a Mongo collection if it does not already exist."""
    existing_collections = set(db.list_collection_names())
    if collection_name in existing_collections:
        print(f"Collection already exists: {collection_name}")
        return db[collection_name]

    db.create_collection(collection_name)
    print(f"Created collection: {collection_name}")
    return db[collection_name]


def setup_database():
    """Connect to MongoDB and ensure required collections and indexes exist."""
    try:
        import pymongo
        from pymongo.errors import ConnectionFailure, PyMongoError, ServerSelectionTimeoutError
    except ImportError:
        print("Error: pymongo is not installed.")
        return

    print(f"Connecting to MongoDB at {MONGO_URI}...")

    try:
        client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        print("Connected to MongoDB.")

        db = client[DB_NAME]
        print(f"Using database: {DB_NAME}")

        collections = {
            name: ensure_collection(db, name) for name in COLLECTIONS_TO_CREATE
        }

        collections["UserDetails"].create_index("email", unique=True)
        print("Ensured unique index on UserDetails.email.")

        # These indexes align with the main query paths used by the backend.
        collections["TaskDetails"].create_index("userID")
        print("Ensured index on TaskDetails.userID.")

        collections["AnnotationDetails"].create_index([("taskId", 1), ("createdBy", 1)])
        print("Ensured compound index on AnnotationDetails.taskId + createdBy.")

        print("Database setup complete.")
        client.close()

    except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
        print(f"Error connecting to MongoDB: {exc}")
        print("Please ensure MongoDB is running and reachable before rerunning setup.")
    except PyMongoError as exc:
        print(f"Error while setting up MongoDB: {exc}")


def check_env_file():
    """Check whether backend/.env exists."""
    env_path = PROJECT_ROOT / "backend" / ".env"
    if env_path.exists():
        print(f"Found existing environment file: {env_path}")
    else:
        print(
            f"Warning: {env_path} not found. You may need to configure environment variables for the backend."
        )


def is_running_in_venv():
    """Check if the script is running inside a virtual environment."""
    return sys.prefix != sys.base_prefix


def main():
    os.chdir(PROJECT_ROOT)
    print("Starting repository setup...")

    try:
        import pymongo  # noqa: F401

        print(f"pymongo already available in {sys.executable}; skipping venv setup.")
        setup_directories()
        setup_database()
        check_env_file()
        print("\nSetup finished successfully!")
        return
    except ImportError:
        pass

    if is_running_in_venv():
        print(f"Running inside virtual environment: {sys.prefix}")
        try:
            import pymongo  # noqa: F401
        except ImportError:
            print("Dependencies missing in active virtual environment. Installing...")
            if not install_dependencies(Path(sys.executable)):
                sys.exit(1)

        setup_directories()
        setup_database()
        check_env_file()
        print("\nSetup finished successfully!")
        return

    venv_path = get_venv_path()
    venv_python = get_venv_python(venv_path)

    if not venv_python.exists():
        if not create_venv(venv_path):
            sys.exit(1)

    if not install_dependencies(venv_python):
        sys.exit(1)

    print(f"Re-launching script within virtual environment: {venv_path}")
    try:
        subprocess.check_call([str(venv_python), str(PROJECT_ROOT / "setup_repo.py"), *sys.argv[1:]])
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)


if __name__ == "__main__":
    main()
