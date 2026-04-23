from redis_client import r

r.set("hello", "world")
print(r.get("hello"))   # -> "world"
r.delete("hello")