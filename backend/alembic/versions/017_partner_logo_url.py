"""partner logo url column

Revision ID: 017_partner_logo_url
Revises: 78174f1b89fc
Create Date: 2026-08-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "017_partner_logo_url"
down_revision: Union[str, Sequence[str], None] = "78174f1b89fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("partner_custom_forms", sa.Column("logo_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("partner_custom_forms", "logo_url")
