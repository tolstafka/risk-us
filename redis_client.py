import redis
from dotenv import load_dotenv
import os

load_dotenv()


r = redis.Redis(
    host=os.getenv("REDIS_HOSTNAME"),
    port=os.getenv("REDIS_PORT"),
    username=os.getenv("REDIS_USERNAME"),
    password=os.getenv("REDIS_PASSWORD"),
    db=0,
    decode_responses=True,
)