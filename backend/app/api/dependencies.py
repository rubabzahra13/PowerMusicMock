import os
import json
import urllib.request
import urllib.error
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import get_db
from dotenv import load_dotenv

from sqlalchemy.orm import Session
from app.models import UserRole

security = HTTPBearer()

def get_current_user_via_api(token: str) -> dict:
    load_dotenv() # Reload from disk dynamically
    supabase_url = os.getenv("SUPABASE_URL") or "https://thnrekngjwtnjkksqomf.supabase.co"
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication configuration missing. Please set SUPABASE_JWT_SECRET or SUPABASE_URL and SUPABASE_ANON_KEY."
        )
    
    url = f"{supabase_url.rstrip('/')}/auth/v1/user"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": supabase_anon_key
        }
    )
    try:
        with urllib.request.urlopen(req) as response:
            user_data = json.loads(response.read().decode())
            return user_data
    except urllib.error.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Auth server connection error: {str(e)}"
        )

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    load_dotenv() # Reload from disk dynamically
    token = credentials.credentials
    supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
    
    if supabase_jwt_secret:
        try:
            # Decode token locally. Supabase Auth JWT uses HS256.
            payload = jwt.decode(token, supabase_jwt_secret, algorithms=["HS256"], options={"verify_aud": False})
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
        except jwt.InvalidTokenError:
            # Mismatched/incorrect JWT secret fallback to network check
            try:
                return get_current_user_via_api(token)
            except HTTPException:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    else:
        # Fallback to network validation if no local secret is configured
        return get_current_user_via_api(token)

def get_db_user_role(user_id: str, db: Session) -> str:
    role_record = db.query(UserRole).filter(UserRole.user_id == user_id).first()
    return role_record.role if role_record else None

def verify_admin(user: dict = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        
    role = get_db_user_role(user_id, db)
    if role == "admin":
        user["role"] = role
        return user
        
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin authorization required")

def verify_manager_or_admin(user: dict = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        
    role = get_db_user_role(user_id, db)
    if role in ("manager", "admin"):
        user["role"] = role
        return user
        
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin authorization required")

def verify_manager(user: dict = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        
    role = get_db_user_role(user_id, db)
    if role == "manager":
        user["role"] = role
        return user
        
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager authorization required")


