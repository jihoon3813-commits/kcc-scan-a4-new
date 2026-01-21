from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from sqlalchemy.orm import relationship

SQLALCHEMY_DATABASE_URL = "sqlite:///./requests.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class WindowRequest(Base):
    __tablename__ = "window_requests"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String, index=True)
    phone = Column(String)
    
    # Analysis & Admin Data
    status = Column(String, default="자료업로드") # 자료업로드, 분석완료, 견적완료
    memo = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    # Relationships
    images = relationship("WindowImage", back_populates="request")

class WindowImage(Base):
    __tablename__ = "window_images"
    
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("window_requests.id"))
    
    image_path = Column(String)
    location_type = Column(String)
    reference_type = Column(String)
    
    # Analysis Results per Image
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    
    request = relationship("WindowRequest", back_populates="images")

