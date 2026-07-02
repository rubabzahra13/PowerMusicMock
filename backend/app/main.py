from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from sqlalchemy import text
from app import models
from app.database import DatabaseConnectionError, get_db, verify_database_connection, engine
from app.api.routers import pilot1

models.Base.metadata.create_all(bind=engine)

def run_db_initialization():
    try:
        with engine.begin() as conn:
            # 1. Create handle_new_user function in public schema
            conn.execute(text("""
                CREATE OR REPLACE FUNCTION public.handle_new_user()
                RETURNS TRIGGER AS $$
                BEGIN
                  INSERT INTO public.user_roles (user_id, role)
                  VALUES (new.id, 'manager')
                  ON CONFLICT (user_id) DO NOTHING;
                  RETURN NEW;
                END;
                $$ LANGUAGE plpgsql SECURITY DEFINER;
            """))

            # 2. Create the trigger on auth.users (requires superuser/postgres access)
            conn.execute(text("""
                DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
                CREATE TRIGGER on_auth_user_created
                  AFTER INSERT ON auth.users
                  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
            """))

            # 3. Enable RLS on public tables
            conn.execute(text("""
                ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
            """))

            # 4. Create RLS Policies
            
            # Policy on user_roles
            conn.execute(text("""
                DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
                CREATE POLICY "Users can view their own role" 
                  ON public.user_roles 
                  FOR SELECT 
                  TO authenticated 
                  USING (auth.uid() = user_id::uuid);
            """))

            # Policies on requests
            conn.execute(text("""
                DROP POLICY IF EXISTS "Admins have full access to requests" ON public.requests;
                CREATE POLICY "Admins have full access to requests"
                  ON public.requests
                  FOR ALL
                  TO authenticated
                  USING (
                    EXISTS (
                      SELECT 1 FROM public.user_roles 
                      WHERE user_roles.user_id = auth.uid()::text AND user_roles.role = 'admin'
                    )
                  );
                
                DROP POLICY IF EXISTS "Managers can insert requests" ON public.requests;
                CREATE POLICY "Managers can insert requests"
                  ON public.requests
                  FOR INSERT
                  TO authenticated
                  WITH CHECK (
                    EXISTS (
                      SELECT 1 FROM public.user_roles 
                      WHERE user_roles.user_id = auth.uid()::text AND user_roles.role = 'manager'
                    )
                  );
            """))

            # Policies on people
            conn.execute(text("""
                DROP POLICY IF EXISTS "Admins have full access to people" ON public.people;
                CREATE POLICY "Admins have full access to people"
                  ON public.people
                  FOR ALL
                  TO authenticated
                  USING (
                    EXISTS (
                      SELECT 1 FROM public.user_roles 
                      WHERE user_roles.user_id = auth.uid()::text AND user_roles.role = 'admin'
                    )
                  );

                DROP POLICY IF EXISTS "Managers can read people for duplicate check" ON public.people;
                CREATE POLICY "Managers can read people for duplicate check"
                  ON public.people
                  FOR SELECT
                  TO authenticated
                  USING (
                    EXISTS (
                      SELECT 1 FROM public.user_roles 
                      WHERE user_roles.user_id = auth.uid()::text AND user_roles.role = 'manager'
                    )
                  );
            """))

            # Policies on activities
            conn.execute(text("""
                DROP POLICY IF EXISTS "Admins have full access to activities" ON public.activities;
                CREATE POLICY "Admins have full access to activities"
                  ON public.activities
                  FOR ALL
                  TO authenticated
                  USING (
                    EXISTS (
                      SELECT 1 FROM public.user_roles 
                      WHERE user_roles.user_id = auth.uid()::text AND user_roles.role = 'admin'
                    )
                  );
            """))
            print("Successfully initialized DB triggers and RLS policies!")
    except Exception as e:
        print(f"WARNING: Database initialization (Triggers/RLS) skipped/failed: {e}")

run_db_initialization()

app = FastAPI(title="Power Music MVP API")

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",
    "https://power-music-mock.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        verify_database_connection(db)
    except DatabaseConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"status": "ok", "database": "connected"}

app.include_router(pilot1.router)
