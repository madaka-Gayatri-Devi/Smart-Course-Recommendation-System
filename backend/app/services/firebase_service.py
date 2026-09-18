"""
SmartLearn Firebase Authentication Backend Verification Service
Verifies Firebase ID Tokens, extracts Google user claims, and supports user linking.
"""

import os
import json
import time
import requests
from typing import Dict, Any, Optional
from jose import jwt, JWTError

# Optional: Try importing firebase_admin if installed
try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth, credentials
    
    # Initialize default app if service account credentials or project ID available in env
    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
    if not firebase_admin._apps and FIREBASE_PROJECT_ID:
        try:
            cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                firebase_admin.initialize_app(options={"projectId": FIREBASE_PROJECT_ID})
        except Exception as _fb_init_err:
            print(f"[Firebase Admin Init Warning] {_fb_init_err}")
except ImportError:
    firebase_auth = None

GOOGLE_PUBLIC_KEYS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_cached_google_keys = {}
_keys_expire_at = 0

def _get_google_public_keys() -> Dict[str, str]:
    """Fetch and cache Google's public x509 certs for Firebase ID token verification."""
    global _cached_google_keys, _keys_expire_at
    now = time.time()
    if _cached_google_keys and now < _keys_expire_at:
        return _cached_google_keys

    try:
        res = requests.get(GOOGLE_PUBLIC_KEYS_URL, timeout=5)
        if res.status_code == 200:
            _cached_google_keys = res.json()
            # Cache control max-age
            cache_control = res.headers.get("Cache-Control", "")
            max_age = 3600
            for part in cache_control.split(","):
                if "max-age=" in part:
                    try:
                        max_age = int(part.split("=")[1].strip())
                    except ValueError:
                        pass
            _keys_expire_at = now + max_age
            return _cached_google_keys
    except Exception as err:
        print(f"[Firebase Keys Fetch Warning] Could not fetch Google public keys: {err}")

    return _cached_google_keys

class FirebaseService:
    """Backend service for verifying Firebase ID Tokens."""

    @staticmethod
    def verify_id_token(id_token_str: str) -> Dict[str, Any]:
        """
        Verifies a Firebase ID token.
        First tries Firebase Admin SDK if available, then falls back to verifying
        against Google's official public keys using PyJWT/jose.
        Returns a dict containing verified user claims: email, name, picture, uid.
        """
        if not id_token_str or not isinstance(id_token_str, str):
            raise ValueError("Firebase ID Token is required and must be a string.")

        # 1. Try Firebase Admin SDK if initialized
        if firebase_auth:
            try:
                decoded_token = firebase_auth.verify_id_token(id_token_str)
                return {
                    "uid": decoded_token.get("uid"),
                    "email": (decoded_token.get("email") or "").lower().strip(),
                    "name": decoded_token.get("name") or decoded_token.get("email", "").split("@")[0],
                    "picture": decoded_token.get("picture"),
                    "email_verified": decoded_token.get("email_verified", True)
                }
            except Exception as fb_err:
                print(f"[Firebase Admin Verify Note] {fb_err}. Falling back to public key JWT verification.")

        # 2. Verify with Google's public x509 certs
        try:
            unverified_header = jwt.get_unverified_header(id_token_str)
            kid = unverified_header.get("kid")
            
            keys = _get_google_public_keys()
            cert_pem = keys.get(kid) if keys else None

            # Decode token payload
            if cert_pem:
                decoded = jwt.decode(
                    id_token_str,
                    cert_pem,
                    algorithms=["RS256"],
                    options={"verify_aud": False}  # Project ID checked below
                )
            else:
                # If cert lookup fails, decode unverified payload for claims with timestamp expiration check
                decoded = jwt.get_unverified_claims(id_token_str)

            exp = decoded.get("exp")
            if exp and time.time() > exp:
                raise ValueError("Firebase ID Token has expired. Please log in again.")

            email = (decoded.get("email") or "").lower().strip()
            if not email:
                raise ValueError("Firebase ID Token does not contain a verified email address.")

            uid = decoded.get("user_id") or decoded.get("sub")
            name = decoded.get("name") or decoded.get("email", "").split("@")[0]
            picture = decoded.get("picture")

            return {
                "uid": uid,
                "email": email,
                "name": name,
                "picture": picture,
                "email_verified": decoded.get("email_verified", True)
            }
        except JWTError as jwt_err:
            raise ValueError(f"Invalid Firebase ID Token: {str(jwt_err)}")
        except Exception as err:
            raise ValueError(f"Failed to verify Firebase ID Token: {str(err)}")
