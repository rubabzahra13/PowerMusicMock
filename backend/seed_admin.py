import os
import sys
import uuid
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

def main():
    # Load env variables from backend/.env
    load_dotenv(dotenv_path=".env")
    load_dotenv(dotenv_path="backend/.env")

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL environment variable is not set in backend/.env")
        sys.exit(1)

    admin_email = os.getenv("ADMIN_EMAIL", "andrea@powermusic.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "AndreaSuperSecurePass2026!")

    # Resolve dialect for SQLAlchemy
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    elif db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)

    print(f"Connecting to database to seed Admin user '{admin_email}'...")
    try:
        engine = create_engine(db_url)
        with engine.begin() as conn:
            # 1. Enable pgcrypto extension if not present
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto;"))
            
            # 2. Check if user already exists
            existing_user = conn.execute(
                text("SELECT id FROM auth.users WHERE email = :email"),
                {"email": admin_email}
            ).fetchone()
            
            if existing_user:
                user_id = existing_user[0]
                print(f"Admin user '{admin_email}' already exists with ID: {user_id}")
                
                # Update password just in case
                conn.execute(
                    text("UPDATE auth.users SET encrypted_password = crypt(:password, gen_salt('bf', 10)), updated_at = now() WHERE id = :id"),
                    {"password": admin_password, "id": user_id}
                )
                print("Admin user password has been successfully updated/confirmed.")
            else:
                user_id = str(uuid.uuid4())
                print(f"Creating new Admin user with ID: {user_id}...")
                
                # Insert into auth.users
                # raw_app_meta_data holds role: admin, raw_user_meta_data holds firstName: Andrea and role: admin
                conn.execute(
                    text("""
                        INSERT INTO auth.users (
                            instance_id,
                            id,
                            aud,
                            role,
                            email,
                            encrypted_password,
                            email_confirmed_at,
                            recovery_sent_at,
                            last_sign_in_at,
                            raw_app_meta_data,
                            raw_user_meta_data,
                            created_at,
                            updated_at,
                            confirmation_token,
                            email_change,
                            email_change_token_new,
                            recovery_token,
                            is_super_admin,
                            is_anonymous
                        ) VALUES (
                            '00000000-0000-0000-0000-000000000000',
                            :id,
                            'authenticated',
                            'authenticated',
                            :email,
                            crypt(:password, gen_salt('bf', 10)),
                            now(),
                            now(),
                            now(),
                            '{"provider": "email", "providers": ["email"], "role": "admin"}',
                            '{"firstName": "Andrea", "lastName": "Admin", "role": "admin"}',
                            now(),
                            now(),
                            '',
                            '',
                            '',
                            '',
                            false,
                            false
                        )
                    """),
                    {"id": user_id, "email": admin_email, "password": admin_password}
                )
                
                # Insert into auth.identities
                conn.execute(
                    text("""
                        INSERT INTO auth.identities (
                            id,
                            user_id,
                            identity_data,
                            provider,
                            provider_id,
                            last_sign_in_at,
                            created_at,
                            updated_at
                        ) VALUES (
                            gen_random_uuid(),
                            CAST(:user_id AS uuid),
                            json_build_object('sub', CAST(:user_id AS text), 'email', CAST(:email AS text)),
                            'email',
                            CAST(:provider_id AS text),
                            now(),
                            now(),
                            now()
                        )
                    """),
                    {"user_id": user_id, "provider_id": user_id, "email": admin_email}
                )
            
            # Ensure the user has the 'admin' role in the user_roles table
            conn.execute(
                text("""
                    INSERT INTO public.user_roles (user_id, role)
                    VALUES (:user_id, 'admin')
                    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
                """),
                {"user_id": user_id}
            )
            print(f"Admin user '{admin_email}' successfully seeded and role verified.")

    except Exception as e:
        print(f"Error seeding admin user: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
