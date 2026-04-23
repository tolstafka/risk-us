import redis
from dotenv import load_dotenv
import os

load_dotenv()

HOST = os.getenv("REDIS_HOSTNAME")
PORT = os.getenv("REDIS_PATH")

r = redis.Redis(
    host=HOST,
    port=PORT,
    db=0,
    decode_responses=True,
)