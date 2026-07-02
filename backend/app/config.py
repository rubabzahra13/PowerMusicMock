import os
from dotenv import load_dotenv

load_dotenv()

# DEVELOPMENT FLAG: Set to True to enforce puregym.com email domain validation.
# Set to False to disable checks during local testing/development.
# Can be configured in backend/.env via ENFORCE_DOMAIN_CHECK
# TODO: Set to True before deploying to production!
ENFORCE_DOMAIN_CHECK = os.getenv("ENFORCE_DOMAIN_CHECK", "true").lower() == "true"
