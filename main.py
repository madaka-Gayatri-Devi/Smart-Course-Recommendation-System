import http.server
import socketserver
import os
import sys
import signal
import threading
import socket
import uvicorn

FRONTEND_PORT = 5500
BACKEND_PORT = 8080
DIRECTORY = "frontend"

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

def start_backend():
    if is_port_in_use(BACKEND_PORT):
        print(f"[SmartLearn] Backend is already running on http://127.0.0.1:{BACKEND_PORT}")
        return
    try:
        from backend.app.main import app
        print(f"[SmartLearn] Starting Backend on port {BACKEND_PORT}...")
        uvicorn.run(app, host="0.0.0.0", port=BACKEND_PORT, log_level="warning")
    except Exception as e:
        print(f"[SmartLearn] Warning: Could not start backend automatically: {e}")
        print(f"You can manually run it via: cd backend && python -m uvicorn app.main:app --port {BACKEND_PORT}")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def signal_handler(sig, frame):
    print("\n[SmartLearn] Servers stopped.")
    os._exit(0)

signal.signal(signal.SIGINT, signal_handler)

if __name__ == "__main__":
    if not os.path.exists(DIRECTORY):
        print(f"Error: The '{DIRECTORY}' directory was not found!")
        sys.exit(1)

    # Start backend server in a separate background daemon thread
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    print(f"[SmartLearn] Serving Frontend at: http://localhost:{FRONTEND_PORT}")
    print(f"[SmartLearn] Backend API target:  http://127.0.0.1:{BACKEND_PORT}")
    print(f"[SmartLearn] Open: http://localhost:{FRONTEND_PORT}/login.html")
    print("Press Ctrl+C to stop the server.")
    with http.server.ThreadingHTTPServer(("", FRONTEND_PORT), Handler) as httpd:
        httpd.serve_forever()

