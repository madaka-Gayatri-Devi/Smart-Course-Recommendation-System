import http.server
import socketserver
import os
import sys
import signal
import threading
import socket
import time
import webbrowser
from pathlib import Path
import uvicorn

# Setup paths
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

FRONTEND_PORT = 5500
BACKEND_PORT = 8080
DIRECTORY = str(FRONTEND_DIR)

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

def start_backend():
    if is_port_in_use(BACKEND_PORT):
        print(f"[SmartLearn] Backend is already running on http://127.0.0.1:{BACKEND_PORT}")
        return
    try:
        from backend.app.main import app
        print(f"[SmartLearn] Starting FastAPI Backend on http://127.0.0.1:{BACKEND_PORT} ...")
        uvicorn.run(app, host="127.0.0.1", port=BACKEND_PORT, log_level="info")
    except Exception as e:
        print(f"[SmartLearn] ERROR: Could not start backend: {e}")
        import traceback
        traceback.print_exc()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def signal_handler(sig, frame):
    print("\n[SmartLearn] Stopping servers...")
    os._exit(0)

signal.signal(signal.SIGINT, signal_handler)

def open_browser():
    time.sleep(1.5)
    url = f"http://localhost:{FRONTEND_PORT}/login.html"
    print(f"[SmartLearn] Opening browser at {url} ...")
    try:
        webbrowser.open_new_tab(url)
    except Exception:
        pass

if __name__ == "__main__":
    if not os.path.exists(DIRECTORY):
        print(f"Error: The '{DIRECTORY}' directory was not found!")
        sys.exit(1)

    # 1. Start backend server thread
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # 2. Open browser
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()

    print("\n" + "=" * 60)
    print("      SMARTLEARN LOCAL DEVELOPMENT SERVERS RUNNING")
    print("=" * 60)
    print(f" -> Frontend Web App : http://localhost:{FRONTEND_PORT}/login.html")
    print(f" -> FastAPI Backend  : http://127.0.0.1:{BACKEND_PORT}")
    print(f" -> API Docs (Swagger): http://127.0.0.1:{BACKEND_PORT}/docs")
    print(f" -> API Health Check : http://127.0.0.1:{BACKEND_PORT}/health")
    print("=" * 60)
    print(" Press Ctrl+C in this terminal window to stop all servers.\n")

    # 3. Serve Frontend
    with http.server.ThreadingHTTPServer(("", FRONTEND_PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[SmartLearn] Servers stopped successfully.")
