from sqlalchemy import Column, DateTime, String, Text, Integer
from sqlalchemy.dialects.postgresql import ARRAY

from app.database import Base


class Request(Base):
    __tablename__ = "requests"

    id = Column(String, primary_key=True)
    received_at = Column(DateTime(timezone=True), nullable=False)
    handled_at = Column(DateTime(timezone=True), nullable=True)

    submitted_by_first_name = Column(String, nullable=False)
    submitted_by_last_name = Column(String, nullable=False)
    submitted_by_email = Column(String, nullable=False)
    submitted_by_club = Column(String, nullable=False)

    person_first_name = Column(String, nullable=False)
    person_last_name = Column(String, nullable=False)
    person_email = Column(String, nullable=False)
    person_location = Column(String, nullable=False)

    action = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    tags = Column(ARRAY(String), nullable=False, server_default="{}")
    created_by = Column(String, nullable=False)
    status = Column(String, nullable=False)


class Person(Base):
    __tablename__ = "people"

    id = Column(String, primary_key=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    location = Column(String, nullable=False)

    status = Column(String, nullable=False)
    date_added = Column(DateTime(timezone=True), nullable=False)
    added_by = Column(String, nullable=False)
    manager_email = Column(String, nullable=False)
    club = Column(String, nullable=False)

    source_request_id = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

class Activity(Base):
    __tablename__ = "activities"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True))
    type = Column(String) 
    description = Column(String)
    linked_request_id = Column(String, nullable=True)

class UserRole(Base):
    __tablename__ = "user_roles"
    
    user_id = Column(String, primary_key=True)
    role = Column(String, nullable=False)

