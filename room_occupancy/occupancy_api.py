import os
from fastapi import FastAPI, HTTPException, Header, Request
from pymongo import MongoClient

app = FastAPI()

mongo_uri = os.environ["MONGO_URI"]

client = MongoClient(mongo_uri)
db = client["appdb"]
collection = db["items"]

@app.get("/items")
def get_items():
    docs = list(collection.find({}, {"_id": 0}))
    return {"items": docs}

@app.get("/*")
def get_items():
    docs = list(collection.find({}, {"_id": 0}))
    return {}

@app.post("/items")
def add_item(
    request: Request,
    payload: dict,
    x_api_key: str | None = Header(default=None)
):
    collection.insert_one(payload)
    return {"ok": True}
